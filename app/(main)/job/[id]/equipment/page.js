import { loadCockpit } from '../cockpit';
import JobHeader from '../JobHeader';
import EquipmentSnap from './EquipmentSnap';
import { canUploadPhotos } from '../jobAccess';

export const dynamic = 'force-dynamic';
const fmt = (iso) => { try { return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } };

// Equipment tied to this service LOCATION — derived from equipment-kind photos across the customer's
// jobs (full registry w/ model/serial/warranty is the next build; this captures + shows the plates).
export default async function EquipmentTab({ params }) {
  const c = await loadCockpit(params.id);
  if (!c.configured) return <div className="wrap"><div className="h1">Equipment</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;

  let plates = [];
  if (c.job.customer_id) {
    try {
      const jr = await c.sb.from('jobs').select('id, job_type, scheduled_at, completed_at').eq('customer_id', c.job.customer_id);
      const ids = (jr.data || []).map((j) => String(j.id));
      const byId = {}; (jr.data || []).forEach((j) => { byId[String(j.id)] = j; });
      if (ids.length) {
        const pr = await c.sb.from('job_photos').select('id, job_id, kind, caption, storage_bucket, storage_path, created_at').is('deleted_at', null).eq('kind', 'equipment').in('job_id', ids).order('created_at', { ascending: false }).limit(12);
        for (const p of (pr.data || [])) {
          let url = null; try { const { data } = await c.sb.storage.from(p.storage_bucket || 'job-photos').createSignedUrl(p.storage_path, 3600); url = data?.signedUrl || null; } catch (_) {}
          const j = byId[String(p.job_id)];
          plates.push({ id: p.id, url, caption: p.caption || 'Equipment', jobType: j?.job_type, date: j?.completed_at || j?.scheduled_at || p.created_at });
        }
      }
    } catch (_) {}
  }

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <JobHeader job={c.job} customer={c.customer} tab="Equipment" />
      <div className="card" style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>🔧 Equipment at this location</div>
        <div className="muted" style={{ fontSize: 11.5 }}>Data plates captured at this address. Snap the model/serial so warranty + age are on file for next time.</div>
        {canUploadPhotos(c.role) && <EquipmentSnap jobId={params.id} />}
      </div>

      {plates.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginTop: 10 }}>
          {plates.map((p) => (
            <a key={p.id} href={p.url || '#'} target="_blank" rel="noreferrer" className="card" style={{ padding: 0, overflow: 'hidden', textDecoration: 'none', color: 'inherit' }}>
              {p.url ? <img src={p.url} alt="" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} /> : <div style={{ aspectRatio: '4/3', display: 'grid', placeItems: 'center', background: 'var(--surface-2)' }}>🔧</div>}
              <div style={{ padding: 8 }}><div style={{ fontWeight: 700, fontSize: 12 }}>{p.jobType || p.caption}</div><div className="muted" style={{ fontSize: 10 }}>{fmt(p.date)}</div></div>
            </a>
          ))}
        </div>
      ) : <div className="card" style={{ marginTop: 10 }}><span className="muted">No equipment captured here yet — snap the plate on this visit.</span></div>}
    </div>
  );
}
