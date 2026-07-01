import { loadCockpit } from '../cockpit';
import JobHeader from '../JobHeader';
import JobParts from '../JobParts';
import JobCosts from '../JobCosts';
import ScanReceipt from '../ScanReceipt';
import JobReceipts from '../JobReceipts';
import { getParts } from '@/lib/qa';
import { can } from '@/lib/roles';
import { canUploadPhotos } from '../jobAccess';

export const dynamic = 'force-dynamic';

// Every receipt scanned on this job — entry rows joined to their photo (thumbnail + date). Best-effort:
// pre-29 schema (no receipt_entries) → empty list, the scanner + costs still work.
async function loadReceiptEntries(sb, jobId) {
  try {
    const { data: rows } = await sb.from('receipt_entries')
      .select('photo_id, vendor, amount_cents, is_subcontractor, sub_name, created_at')
      .eq('job_id', String(jobId)).order('created_at', { ascending: false }).limit(60);
    if (!rows?.length) return [];
    const ids = rows.map((r) => r.photo_id).filter(Boolean);
    let byId = {};
    if (ids.length) {
      const { data: ph } = await sb.from('job_photos').select('id, storage_bucket, storage_path').in('id', ids);
      const signed = await Promise.all((ph || []).map(async (p) => {
        try { const { data: s } = await sb.storage.from(p.storage_bucket || 'job-photos').createSignedUrl(p.storage_path, 3600); return [p.id, s?.signedUrl || null]; }
        catch (_) { return [p.id, null]; }
      }));
      byId = Object.fromEntries(signed);
    }
    return rows.map((r) => ({
      photoId: r.photo_id,
      vendor: r.vendor || '',
      amountCents: Number(r.amount_cents) || 0,
      isSub: r.is_subcontractor === true,
      subName: r.sub_name || '',
      when: r.created_at ? new Date(r.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '',
      thumbUrl: byId[r.photo_id] || null,
    }));
  } catch (_) { return []; }
}

export default async function PartsTab({ params }) {
  const c = await loadCockpit(params.id);
  if (!c.configured) return <div className="wrap"><div className="h1">Parts</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const parts = await getParts(c.sb, params.id);
  const canReturn = can(c.role, 'changeStatus') || can(c.role, 'manageInventory') || canUploadPhotos(c.role);
  const canCosts = can(c.role, 'changeStatus') || can(c.role, 'collectPayment') || can(c.role, 'seeFinancials') || canUploadPhotos(c.role);
  const receiptEntries = canCosts ? await loadReceiptEntries(c.sb, params.id) : [];

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <JobHeader job={c.job} customer={c.customer} tab="Parts/PO" />
      <div className="muted" style={{ fontSize: 12, margin: '10px 0 0' }}>Parts, receipts &amp; cost for this job only — material feeds your pay margin.</div>
      <JobParts jobId={params.id} parts={parts} canReturn={canReturn} />
      {!parts.items?.length && <div className="card" style={{ marginTop: 10 }}><span className="muted">No parts issued to this job yet. Pull from the shop counter → they land here on this job number.</span></div>}
      {canCosts && <ScanReceipt jobId={params.id} dispatchCents={c.job.dispatch_fee_cents} />}
      {/* 🧾 The scanned-receipt LIST — every run shows, adds up, and can be flipped Material ↔ Sub. */}
      {canCosts && <JobReceipts jobId={params.id} entries={receiptEntries} />}
      {canCosts && <JobCosts jobId={params.id} materialCents={c.job.material_cost_cents} dispatchCents={c.job.dispatch_fee_cents} canEdit />}
    </div>
  );
}
