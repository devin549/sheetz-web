import { requirePerm } from '@/lib/guard';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import BrainKbClient from './BrainKbClient';

export const dynamic = 'force-dynamic';

// 🧠 Brain Knowledge — the office feeds manufacturer guidance, common fixes, and Kentucky code notes here;
// the public Plumber's Brain (/api/ask) grounds its answers in them and cites the source.
export default async function BrainKb() {
  await requirePerm('seeReports', 'manageUsers', 'seeFinancials');
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">🧠 Brain Knowledge</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const sb = getSupabaseAdmin();

  let entries = [], needsMig = false;
  try {
    const { data, error } = await sb.from('brain_kb')
      .select('id, topic, body, tags, category, source_label, source_url, active, created_by_name, created_at')
      .order('created_at', { ascending: false }).limit(500);
    if (error) { if (/relation|does not exist|schema cache/i.test(error.message)) needsMig = true; } else entries = data || [];
  } catch { needsMig = true; }

  return <BrainKbClient entries={entries} needsMig={needsMig} />;
}
