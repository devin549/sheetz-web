-- 166 — atomic invoice balance changes (audit P2-18). Payments/refunds were applied as read-modify-write
-- (read balance → compute → write), so two concurrent moves on the same invoice (a card charge + a cash
-- collect at the same moment, or a double-tap) could lose an update or subtract twice. This does it in ONE
-- UPDATE — the row lock makes concurrent applies serialize correctly, no lost update.
--
-- p_delta: signed dollars ADDED to the balance. A PAYMENT passes a NEGATIVE delta (reduces balance); a
-- REFUND/chargeback passes a POSITIVE delta (re-opens balance). Returns the new balance (or null if no row).
create or replace function public.apply_invoice_delta(p_invoice_id uuid, p_delta numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare newbal numeric;
begin
  update public.invoices
    set balance = greatest(0, round((coalesce(balance, 0) + p_delta)::numeric, 2))
    where id = p_invoice_id
    returning balance into newbal;
  if newbal is null then return null; end if;

  -- Reflect status: paid off at zero (payment); re-opened above zero (refund). Best-effort so a DB without the
  -- paid_at column (pre-migration variance) still flips status.
  if newbal = 0 then
    begin update public.invoices set status = 'paid', paid_at = now() where id = p_invoice_id;
    exception when others then update public.invoices set status = 'paid' where id = p_invoice_id; end;
  elsif p_delta > 0 then
    update public.invoices set status = 'open' where id = p_invoice_id;
  end if;
  return newbal;
end $$;
