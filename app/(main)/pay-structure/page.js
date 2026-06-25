import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import StructureEditor from './StructureEditor';

export const dynamic = 'force-dynamic';

export default async function PayStructure() {
  await requirePerm('manageUsers', 'seeFinancials'); // owner / GM / accounting
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">💰 Pay Structures</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  const sb = getSupabaseAdmin();
  const q = await sb.from('pay_structures').select('*').order('name', { ascending: true });
  if (q.error && /pay_structures|does not exist|schema cache/i.test(q.error.message || '')) {
    return <div className="wrap"><div className="h1">💰 Pay Structures</div><div className="notice">Run <code>supabase/73_pay_structure.sql</code> in Supabase to enable pay structures.</div></div>;
  }
  return <StructureEditor structures={q.data || []} />;
}
