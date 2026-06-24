import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requireHref } from '@/lib/guard';
import ToolCheckoutClient from './ToolCheckoutClient';

export const dynamic = 'force-dynamic';

export default async function ToolCheckout() {
  await requireHref('/tool-checkout');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">🧰 Tool Check-Out</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();
  const res = await sb.from('tools').select('id, name, serial, mfg, year, value, assigned_to, status').order('name');
  if (res.error && /could not find|does not exist|schema cache/i.test(res.error.message || '')) {
    return <div className="wrap"><div className="h1">🧰 Tool Check-Out</div><div className="notice">Tools need their table — run <code>supabase/05_truck_tools.sql</code> in Supabase.</div></div>;
  }
  let techsQ = await sb.from('techs').select('name, position').order('name');
  if (techsQ.error) techsQ = await sb.from('techs').select('name').order('name');
  const techs = (techsQ.data || []).map((t) => t.name).filter(Boolean);

  return (
    <div className="wrap" style={{ maxWidth: 900 }}>
      <div className="h1">🧰 Tool Check-Out</div>
      <p className="muted">Who has which tool. Check out to a tech, check back in — clean recovery list at termination, no scavenger hunt.</p>
      <ToolCheckoutClient tools={res.data || []} techs={techs} />
    </div>
  );
}
