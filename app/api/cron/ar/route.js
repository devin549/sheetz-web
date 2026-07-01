import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { postToDiscord } from '@/lib/discord';
import { etWeekday } from '@/lib/onCall';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 📅 AR due-date reminders — the "Net-30 chases itself" cron (daily 9am ET, weekdays). billNet30 pings the
// office ONCE the day the tech bills it; this closes the gap after that: every open invoice WITH a due date
// gets surfaced when it's coming due (≤3 days), due today, or overdue — so nothing rides AR unnoticed.
// Legacy-import safe: invoices with NO due_date (the old ServiceTitan rows) are skipped entirely.
// Secured by CRON_SECRET (header-only, audit P2-13).
function authed(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${secret}`;
}

const money = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Today in ET as YYYY-MM-DD (due_date is a plain date column — compare as strings, no TZ drift).
const etToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);

// One compact line per invoice; cap each bucket so a rough month doesn't flood #office.
function lines(rows, today, cap = 8) {
  const out = rows.slice(0, cap).map((r) => {
    const who = r.customer_name || 'Customer';
    const late = daysBetween(r.due_date, today);
    const when = late > 0 ? `${late}d late` : late === 0 ? 'today' : `in ${-late}d`;
    return `• ${who} — ${r.invoice_number || 'invoice'} · ${money(r.balance)} · due ${r.due_date} (${when})`;
  });
  if (rows.length > cap) out.push(`…and ${rows.length - cap} more`);
  return out.join('\n');
}

export async function GET(request) {
  if (!authed(request)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const wd = etWeekday();
  if (wd === 'Saturday' || wd === 'Sunday') return NextResponse.json({ ok: true, skipped: wd });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: 'No admin client' }, { status: 500 });

  const today = etToday();
  const horizon = addDays(today, 3);
  let rows = [];
  try {
    // No customers() join — the legacy-imported invoices table has no FK relationship registered, so a nested
    // select errors. Fetch invoices flat, then resolve names in one .in() lookup below.
    const { data, error } = await sb.from('invoices')
      .select('id, invoice_number, balance, due_date, customer_id')
      .gt('balance', 0).not('due_date', 'is', null).lte('due_date', horizon)
      .order('due_date', { ascending: true }).limit(200);
    if (error) throw error;
    rows = data || [];
  } catch (e) {
    // due_date column missing (pre-net-30 schema) → nothing to remind about, not an error.
    if (/due_date|column/i.test(String(e?.message))) return NextResponse.json({ ok: true, skipped: 'no due_date column' });
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 120) }, { status: 500 });
  }
  // Resolve customer names (best-effort — a missing name just prints "Customer").
  try {
    const ids = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))];
    if (ids.length) {
      const { data: custs } = await sb.from('customers').select('id, name').in('id', ids.slice(0, 200));
      const byId = Object.fromEntries((custs || []).map((c) => [c.id, c.name]));
      rows.forEach((r) => { r.customer_name = byId[r.customer_id] || null; });
    }
  } catch (_) {}

  const overdue = rows.filter((r) => r.due_date < today);
  const dueToday = rows.filter((r) => r.due_date === today);
  const dueSoon = rows.filter((r) => r.due_date > today);
  if (!rows.length) return NextResponse.json({ ok: true, quiet: true, overdue: 0, dueToday: 0, dueSoon: 0 });

  const parts = ['📅 **AR reminders — invoices with due dates** (Net-30 + terms)'];
  if (overdue.length) parts.push(`🔴 **OVERDUE (${overdue.length})** — call + collect:\n${lines(overdue, today)}`);
  if (dueToday.length) parts.push(`🟠 **Due TODAY (${dueToday.length})**:\n${lines(dueToday, today)}`);
  if (dueSoon.length) parts.push(`🟡 **Coming due ≤3 days (${dueSoon.length})**:\n${lines(dueSoon, today)}`);
  parts.push('Collect + mark paid on /past-due — then send the paid invoice.');

  const r = await postToDiscord(parts.join('\n\n'), { to: 'office' });
  return NextResponse.json({ ok: !!r.ok, overdue: overdue.length, dueToday: dueToday.length, dueSoon: dueSoon.length, posted: r.ok, error: r.ok ? undefined : r.error });
}
