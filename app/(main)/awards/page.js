import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import AwardsManager from './AwardsManager';

export const dynamic = 'force-dynamic';

export default async function Awards() {
  await requirePerm('manageUsers'); // owner / GM / office
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">🏆 Awards</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  const sb = getSupabaseAdmin();
  let awards = [];
  const q = await sb.from('awards').select('*').order('active', { ascending: false }).order('sort', { ascending: true }).order('created_at', { ascending: false });
  if (q.error && /awards|does not exist|schema cache/i.test(q.error.message || '')) {
    return <div className="wrap"><div className="h1">🏆 Awards</div><div className="notice">Run <code>supabase/71_awards.sql</code> in Supabase to enable the awards catalog.</div></div>;
  }
  awards = q.data || [];
  return <AwardsManager awards={awards} />;
}
