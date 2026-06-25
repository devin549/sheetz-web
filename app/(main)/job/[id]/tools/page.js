import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import { canViewJob, jobTitle, loadJob } from '../jobAccess';
import JobTools from './JobTools';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

// Suggested tools by job-type keyword (no job_type→tools table yet — sensible defaults the tech can search).
const SUGGEST = [
  [/drain|clog|sewer|rooter/i, ['Cable machine', 'Sectional machine', 'Camera / scope', 'Jetter', 'Nozzles']],
  [/water ?heater|tankless/i, ['Tubing cutter', 'Pro-Press', 'Flex connectors', 'T&P valve', 'Combustion analyzer']],
  [/excavat|dig|main|replace/i, ['Mini-excavator', 'Trench shovel', 'Pipe locator', 'Tamper', 'Fusion machine']],
  [/leak|repair|faucet|toilet/i, ['Basin wrench', 'Pro-Press', 'Torch kit', 'Putty / wax', 'Supply lines']],
];
function suggestFor(jobType) { const hit = SUGGEST.find(([re]) => re.test(String(jobType || ''))); return hit ? hit[1] : ['Cable machine', 'Camera / scope', 'Pro-Press', 'Wet vac']; }

const R = (d) => (d * Math.PI) / 180;
function haversineMi(aLat, aLng, bLat, bLng) {
  const dLat = R(bLat - aLat), dLng = R(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(R(aLat)) * Math.cos(R(bLat)) * Math.sin(dLng / 2) ** 2;
  return 3959 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function bearing(aLat, aLng, bLat, bLng) {
  const y = Math.sin(R(bLng - aLng)) * Math.cos(R(bLat));
  const x = Math.cos(R(aLat)) * Math.sin(R(bLat)) - Math.sin(R(aLat)) * Math.cos(R(bLat)) * Math.cos(R(bLng - aLng));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export default async function JobToolsScreen({ params }) {
  const { user, role, profile } = await requirePerm('seeAllJobs', 'seeQueue', 'seeOwnOnly', 'seeCrew');
  const id = params.id;
  if (!isAdminConfigured) return <div className="wrap"><div className="h1">Tools</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const sb = getSupabaseAdmin();
  const { data: job, error } = await loadJob(sb, id);
  if (error || !job) notFound();
  if (!(await canViewJob(sb, user, profile, role, job))) notFound();

  const customer = job.customers || {};
  const jobLat = job.lat, jobLng = job.lng;

  // Tools (who holds them), holder locations, holder phones, shop stock.
  const [tr, lr, hr, sr] = await Promise.all([
    sb.from('tools').select('id, name, serial, assigned_to, status').order('name').then((r) => r).catch(() => ({ data: [] })),
    sb.from('tech_locations').select('tech_name, lat, lng').then((r) => r).catch(() => ({ data: [] })),
    sb.from('techs').select('name, phone').then((r) => r).catch(() => ({ data: [] })),
    sb.from('shop_stock').select('id, item, qty, bin').order('item').then((r) => r).catch(() => ({ data: [] })),
  ]);
  const locByTech = {}; (lr.data || []).forEach((l) => { if (l.lat != null && l.lng != null) locByTech[String(l.tech_name || '').toLowerCase()] = l; });
  const phoneByTech = {}; (hr.data || []).forEach((t) => { phoneByTech[String(t.name || '').toLowerCase()] = t.phone; });

  const tools = (tr.data || []).map((t) => {
    const holder = t.assigned_to || '';
    const loc = locByTech[String(holder).toLowerCase()];
    const haveGeo = jobLat != null && jobLng != null && loc;
    const distMi = haveGeo ? haversineMi(jobLat, jobLng, loc.lat, loc.lng) : null;
    return {
      id: t.id, name: t.name || 'Tool', serial: t.serial || '', status: t.status, holder,
      located: !!haveGeo, distMi: distMi ?? 0, etaMin: haveGeo ? Math.max(1, Math.round((distMi / 30) * 60)) : null,
      bearingDeg: haveGeo ? bearing(jobLat, jobLng, loc.lat, loc.lng) : 0,
      holderPhone: phoneByTech[String(holder).toLowerCase()] || '',
      routeUrl: haveGeo ? `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}` : (loc ? `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}` : ''),
    };
  });

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <Link href={`/job/${id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--amber)', textDecoration: 'none' }}><ArrowLeft size={14} /> Job Cockpit</Link>
      <div className="h1" style={{ marginTop: 6, marginBottom: 2 }}>🔧 Tools · {customer.name || 'Customer'}</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>{jobTitle(job)}{job.job_number ? ` · #${job.job_number}` : ''}{(jobLat == null) ? ' — job has no location, so distances are hidden.' : ''}</div>
      <JobTools jobId={id} jobType={job.job_type} suggestions={suggestFor(job.job_type)} tools={tools} shopItems={sr.data || []} address={customer.address} />
    </div>
  );
}
