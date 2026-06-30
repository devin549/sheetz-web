import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { equipmentPnl } from '@/lib/equipmentPnl';
import EquipmentManager from './EquipmentManager';

export const dynamic = 'force-dynamic';

export default async function Equipment() {
  await requirePerm('manageInventory'); // shop (Reid) / owner / GM / OM
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">🚜 Equipment</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  const sb = getSupabaseAdmin();

  let units = [];
  try {
    const { data, error } = await sb.from('equipment_fleet').select('*').eq('active', true).order('unit_label');
    if (error && /equipment_fleet|does not exist/i.test(error.message)) {
      return <div className="wrap"><div className="h1">🚜 Equipment</div><div className="notice">Run <code>supabase/146 + 147 + 148</code> in Supabase to enable the equipment asset tracker.</div></div>;
    }
    units = data || [];
  } catch (_) {}

  const pnlById = {};
  try { (await equipmentPnl(sb)).forEach((p) => { pnlById[p.id] = p; }); } catch (_) {}

  const serviceByUnit = {};
  if (units.length) {
    try {
      const { data } = await sb.from('equipment_service').select('id, unit_id, service_date, item, vendor, cost_cents').in('unit_id', units.map((u) => u.id)).order('service_date', { ascending: false });
      (data || []).forEach((s) => { (serviceByUnit[s.unit_id] = serviceByUnit[s.unit_id] || []).push(s); });
    } catch (_) {}
  }

  return <EquipmentManager units={units} pnlById={pnlById} serviceByUnit={serviceByUnit} />;
}
