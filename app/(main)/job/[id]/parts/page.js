import { loadCockpit } from '../cockpit';
import JobHeader from '../JobHeader';
import JobParts from '../JobParts';
import JobCosts from '../JobCosts';
import { getParts } from '@/lib/qa';
import { can } from '@/lib/roles';
import { canUploadPhotos } from '../jobAccess';

export const dynamic = 'force-dynamic';

export default async function PartsTab({ params }) {
  const c = await loadCockpit(params.id);
  if (!c.configured) return <div className="wrap"><div className="h1">Parts</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const parts = await getParts(c.sb, params.id);
  const canReturn = can(c.role, 'changeStatus') || can(c.role, 'manageInventory') || canUploadPhotos(c.role);
  const canCosts = can(c.role, 'changeStatus') || can(c.role, 'collectPayment') || can(c.role, 'seeFinancials') || canUploadPhotos(c.role);

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <JobHeader job={c.job} customer={c.customer} tab="Parts/PO" />
      <div className="muted" style={{ fontSize: 12, margin: '10px 0 0' }}>Parts, receipts &amp; cost for this job only — material feeds your pay margin.</div>
      <JobParts jobId={params.id} parts={parts} canReturn={canReturn} />
      {!parts.items?.length && <div className="card" style={{ marginTop: 10 }}><span className="muted">No parts issued to this job yet. Pull from the shop counter → they land here on this job number.</span></div>}
      {canCosts && <JobCosts jobId={params.id} materialCents={c.job.material_cost_cents} dispatchCents={c.job.dispatch_fee_cents} canEdit />}
    </div>
  );
}
