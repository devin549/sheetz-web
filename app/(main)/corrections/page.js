import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { requirePerm } from '@/lib/guard';
import CorrectionsList from './CorrectionsList';

export const dynamic = 'force-dynamic';

// Office QA-Holds / Correction-needed queue. Open corrections (failed proof, tech gone) with the
// circled photo + reason + note + office actions. Reads the existing spine — no new photo system.
export default async function Corrections() {
  await requirePerm('qaReview'); // FS / foreman / GM / owner / office

  if (!isAdminConfigured) {
    return <div className="wrap"><div className="h1">🚧 QA Holds</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel.</div></div>;
  }
  const sb = getSupabaseAdmin();

  let items = [];
  const cq = await sb.from('job_corrections')
    .select('id, orig_job_id, photo_id, review_id, fail_reason, manager_note, correction_job_id, customer_contacted, created_by_name, created_at')
    .eq('status', 'open').order('created_at', { ascending: false });
  if (!cq.error) items = cq.data || [];
  const needsTable = cq.error && /does not exist|schema cache|could not find/i.test(cq.error.message || '');

  if (items.length) {
    const photoIds = [...new Set(items.map((c) => c.photo_id).filter(Boolean))];
    const reviewIds = [...new Set(items.map((c) => c.review_id).filter(Boolean))];
    const jobIds = [...new Set(items.map((c) => c.orig_job_id).filter(Boolean))];
    // photos (sign urls) + annotations + job→customer name
    const [pr, ar, jr] = await Promise.all([
      photoIds.length ? sb.from('job_photos').select('id, storage_bucket, storage_path').in('id', photoIds) : Promise.resolve({ data: [] }),
      reviewIds.length ? sb.from('job_photo_annotations').select('id, review_id, x, y, w, h').in('review_id', reviewIds) : Promise.resolve({ data: [] }),
      jobIds.length ? sb.from('jobs').select('id, customers(name)').in('id', jobIds) : Promise.resolve({ data: [] }),
    ]);
    const photoById = {};
    for (const p of (pr.data || [])) {
      const { data: signed } = await sb.storage.from(p.storage_bucket || 'job-photos').createSignedUrl(p.storage_path, 60 * 60);
      photoById[p.id] = signed?.signedUrl || null;
    }
    const annoByReview = {};
    (ar.data || []).forEach((a) => { (annoByReview[a.review_id] = annoByReview[a.review_id] || []).push(a); });
    const custByJob = {};
    (jr.data || []).forEach((j) => { custByJob[j.id] = j.customers?.name || ''; });
    items = items.map((c) => ({ ...c, signedUrl: photoById[c.photo_id] || null, annotations: annoByReview[c.review_id] || [], customerName: custByJob[c.orig_job_id] || '' }));
  }

  return (
    <div className="wrap" style={{ maxWidth: 900 }}>
      <div className="h1">🚧 QA Holds · Corrections needed</div>
      <p className="muted">Failed proof where the tech has left. Book a correction visit, log a customer contact, or resolve once corrected proof passes. The original job can’t fully close while a correction is open.</p>
      {needsTable && <div className="notice">Run <code>supabase/68_job_corrections.sql</code> in Supabase to enable corrections.</div>}
      <CorrectionsList items={items} />
    </div>
  );
}
