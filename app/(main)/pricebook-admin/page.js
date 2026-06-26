import { requirePerm } from '@/lib/guard';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import PricebookAdmin from './PricebookAdmin';

export const dynamic = 'force-dynamic';

// 🛠 Owner pricebook editor — add/customize items + let Flush Gordon hype new drops to the team.
export default async function PricebookAdminPage() {
  await requirePerm('manageInventory', 'manageUsers', 'seeReports', 'seeFinancials');
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">🛠 Pricebook Editor</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  const sb = getSupabaseAdmin();

  let items = [], cats = [], needsMig = false;
  try {
    const wk = new Date(Date.now() - 7 * 86400000).toISOString();
    const q = await sb.from('pricebook_items').select('id, name, customer_name, retail_price, estimated_material_cost, created_at, customer_visible').eq('active', true).order('created_at', { ascending: false }).limit(300);
    if (q.error) { if (/relation|does not exist|schema cache/i.test(q.error.message)) needsMig = true; } else items = (q.data || []).map((i) => ({ ...i, isNew: i.created_at && i.created_at >= wk }));
    const cq = await sb.from('pricebook_categories').select('id, name').eq('active', true).order('name');
    cats = cq.data || [];
  } catch { needsMig = true; }

  const newCount = items.filter((i) => i.isNew).length;
  return <PricebookAdmin items={items} cats={cats} needsMig={needsMig} newCount={newCount} />;
}
