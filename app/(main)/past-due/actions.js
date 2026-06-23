'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { roleOf } from '@/lib/nav';
import { can } from '@/lib/roles';
import { revalidatePath } from 'next/cache';

// Only financial seats (owner/accounting/gm) may mark AR paid — never read-only viewer.
async function assertCanMark() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const role = roleOf(user);
  if (!user || !can(role, 'seeFinancials') || role === 'viewer') throw new Error('Your role can’t mark invoices paid.');
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error('Server not configured.');
  return sb;
}

// Mark one invoice paid → it drops out of past-due.
export async function markInvoicePaid(invoiceId) {
  let sb;
  try { sb = await assertCanMark(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  if (!invoiceId) return { ok: false, msg: 'No invoice.' };
  const { error } = await sb.from('invoices').update({ status: 'paid' }).eq('id', invoiceId);
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/past-due');
  return { ok: true };
}

// Mark ALL of a customer's open invoices paid (the whole balance cleared).
export async function markCustomerPaid(customerId) {
  let sb;
  try { sb = await assertCanMark(); } catch (e) { return { ok: false, msg: String(e.message || e) }; }
  if (!customerId) return { ok: false, msg: 'No customer.' };
  const { error } = await sb.from('invoices').update({ status: 'paid' }).eq('customer_id', customerId).eq('status', 'open');
  if (error) return { ok: false, msg: error.message };
  revalidatePath('/past-due');
  return { ok: true };
}
