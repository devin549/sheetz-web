import { requirePerm } from '@/lib/guard';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { isStripeConfigured } from '@/lib/stripe';
import CardReaders from './CardReaders';

export const dynamic = 'force-dynamic';

// 💳 Card Readers — owner/manager pairs WisePOS E readers for in-person close-out collection.
export default async function CardReadersPage() {
  await requirePerm('manageUsers', 'manageInventory', 'seeFinancials');
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">💳 Card Readers</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  const sb = getSupabaseAdmin();

  let readers = [], needsMig = false;
  try {
    const { data, error } = await sb.from('terminal_readers').select('id, label, is_default, tech_id, status, techs(name)').order('is_default', { ascending: false }).order('created_at', { ascending: true });
    if (error) { if (/relation|does not exist|schema cache/i.test(error.message)) needsMig = true; }
    else readers = (data || []).map((r) => ({ ...r, tech_name: r.techs?.name || null }));
  } catch { needsMig = true; }

  return <CardReaders readers={readers} stripeReady={isStripeConfigured()} needsMig={needsMig} />;
}
