import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import ReceiptInboxClient from './ReceiptInboxClient';

export const dynamic = 'force-dynamic';

export default async function Receipts() {
  await requirePerm('seeFinancials', 'seeReports');

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">Receipt Inbox</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();

  const { data: photos, error } = await sb.from('job_photos')
    .select('id, job_id, storage_bucket, storage_path, file_name, created_at, uploaded_by_name')
    .eq('kind', 'receipt').is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(120);

  if (error && /could not find|does not exist|schema cache/i.test(error.message || '')) {
    return <div className="wrap"><div className="h1">Receipt Inbox</div><div className="notice">Photo spine not set up — run <code>supabase/23_job_photo_spine.sql</code>. Then techs tag receipt photos on jobs and they land here.</div></div>;
  }
  const list = photos || [];

  // signed image URLs
  const withUrls = await Promise.all(list.map(async (p) => {
    const { data: s } = await sb.storage.from(p.storage_bucket || 'job-photos').createSignedUrl(p.storage_path, 3600);
    return { ...p, signedUrl: s?.signedUrl || null };
  }));

  // job context (tech + customer); jobs↔customers has no FK so resolve names separately
  const jobIds = [...new Set(list.map((p) => p.job_id).filter(Boolean))];
  const jobById = {};
  if (jobIds.length) {
    const { data: jobs } = await sb.from('jobs').select('id, tech_name, customer_id, job_number').in('id', jobIds);
    const custIds = [...new Set((jobs || []).map((j) => j.customer_id).filter(Boolean))];
    const cname = {};
    if (custIds.length) { const { data: cs } = await sb.from('customers').select('id, name').in('id', custIds); (cs || []).forEach((c) => { cname[c.id] = c.name; }); }
    (jobs || []).forEach((j) => { jobById[j.id] = { tech: j.tech_name || '', customer: cname[j.customer_id] || '', job_number: j.job_number || '' }; });
  }

  // existing entries (guarded — 29_receipts.sql may not be run)
  const entryByPhoto = {};
  let entriesReady = true;
  if (list.length) {
    const { data: entries, error: eErr } = await sb.from('receipt_entries').select('photo_id, vendor, amount_cents, category, status, note, reviewed_by_name').in('photo_id', list.map((p) => p.id));
    if (eErr) entriesReady = false; else (entries || []).forEach((e) => { entryByPhoto[e.photo_id] = e; });
  }

  const receipts = withUrls.map((p) => ({
    photoId: p.id, jobId: p.job_id || '', signedUrl: p.signedUrl, fileName: p.file_name,
    uploadedBy: p.uploaded_by_name || '', createdAt: p.created_at,
    job: jobById[p.job_id] || {}, entry: entryByPhoto[p.id] || null,
  }));

  return (
    <div className="wrap" style={{ maxWidth: 980 }}>
      <div className="h1">Receipt Inbox</div>
      <p className="muted">Receipt photos techs tag on jobs — enter vendor + amount, then verify or flag.</p>
      {!entriesReady && <div className="notice">Saving needs the entries table — run <code>supabase/29_receipts.sql</code>. You can still view receipts below.</div>}
      <ReceiptInboxClient receipts={receipts} canSave={entriesReady} />
    </div>
  );
}
