import { requirePerm } from '@/lib/guard';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { LEAD_CATEGORIES } from '@/lib/serpLeads';
import { LOCATIONS } from '@/lib/rankConfig';
import LeadsClient from './LeadsClient';

export const dynamic = 'force-dynamic';

export default async function Leads() {
  await requirePerm('seeReports', 'assignJobs', 'manageUsers', 'seeFinancials', 'seeCrew');
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">🏢 Commercial Leads</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const sb = getSupabaseAdmin();

  let saved = [], needsMig = false;
  try {
    const { data, error } = await sb.from('leads').select('id, name, category, address, phone, website, rating, reviews, status, notes, claimed_by, created_at').order('created_at', { ascending: false }).limit(500);
    if (error) { if (/relation|does not exist|schema cache/i.test(error.message)) needsMig = true; } else saved = data || [];
  } catch { needsMig = true; }

  return (
    <div className="wrap" style={{ maxWidth: 860 }}>
      <div className="h1" style={{ marginBottom: 2 }}>🏢 Commercial Lead Finder</div>
      <p className="muted" style={{ fontSize: 13 }}>Pull apartment complexes, property managers, restaurants &amp; more from Google Maps → work them as plumbing accounts.</p>
      {needsMig && <div className="notice">Run <code>supabase/108_leads.sql</code> to save leads.</div>}
      <LeadsClient categories={LEAD_CATEGORIES} towns={LOCATIONS} saved={saved} disabled={needsMig} />
    </div>
  );
}
