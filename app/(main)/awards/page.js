import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import AwardsManager from './AwardsManager';
import AwardGrant from './AwardGrant';

export const dynamic = 'force-dynamic';

export default async function Awards() {
  await requirePerm('manageUsers'); // owner / GM / office
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">🏆 Awards</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  const sb = getSupabaseAdmin();
  const q = await sb.from('awards').select('*').order('active', { ascending: false }).order('sort', { ascending: true }).order('created_at', { ascending: false });
  if (q.error && /awards|does not exist|schema cache/i.test(q.error.message || '')) {
    return <div className="wrap"><div className="h1">🏆 Awards</div><div className="notice">Run <code>supabase/71_awards.sql</code> in Supabase to enable the awards catalog.</div></div>;
  }
  const awards = q.data || [];
  const active = awards.filter((a) => a.active);

  // Grant panel data: techs + recent grants (best-effort — grants table may not be migrated yet).
  let techs = [], recent = [];
  try { const t = await sb.from('techs').select('id, name').order('name'); techs = (t.data || []); } catch (_) {}
  try { const g = await sb.from('award_grants').select('id, tech_name, title, amount_cents, points, note, granted_by, created_at').order('created_at', { ascending: false }).limit(12); recent = g.error ? [] : (g.data || []); } catch (_) {}

  return (
    <>
      <AwardsManager awards={awards} />
      <AwardGrant techs={techs} awards={active} recent={recent} />
    </>
  );
}
