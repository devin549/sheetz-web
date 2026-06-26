import { loadCockpit } from '../cockpit';
import JobHeader from '../JobHeader';
import EquipmentSnap from './EquipmentSnap';
import PlateScanner from './PlateScanner';
import { canUploadPhotos } from '../jobAccess';

export const dynamic = 'force-dynamic';
const fmt = (iso) => { try { return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } };
const FUEL_COLOR = { 'NATURAL GAS': '#4f9bff', 'LP / PROPANE': '#ff8a3d', 'ELECTRIC': '#4caf50', 'UNKNOWN': 'var(--fg-3)' };
const nowYear = new Date().getFullYear();

// Equipment tied to this service LOCATION — a structured registry (saved plate reads: model/serial/fuel/age)
// plus the equipment-kind photos across the customer's jobs.
export default async function EquipmentTab({ params }) {
  const c = await loadCockpit(params.id);
  if (!c.configured) return <div className="wrap"><div className="h1">Equipment</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;

  // Structured equipment registry for this location (saved plate reads). Fail-soft until migration 103.
  let registry = [];
  if (c.job.customer_id) {
    try {
      const { data } = await c.sb.from('customer_equipment').select('id, type, brand, model, serial, fuel_type, capacity_gallons, year, warranty_through, notes, created_at').eq('customer_id', c.job.customer_id).order('created_at', { ascending: false }).limit(20);
      registry = data || [];
    } catch (_) {}
  }

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
        {canUploadPhotos(c.role) && <PlateScanner jobType={c.job.job_type || ''} jobId={params.id} />}
        {canUploadPhotos(c.role) && <EquipmentSnap jobId={params.id} />}
      </div>

      {/* Structured registry — what's actually installed here, on file from prior plate scans. */}
      {registry.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {registry.map((e) => {
            const fc = FUEL_COLOR[e.fuel_type] || 'var(--fg-3)';
            const age = e.year ? nowYear - e.year : null;
            const warnProb = age != null && age >= 10;
            return (
              <div key={e.id} className="card" style={{ borderLeft: `3px solid ${fc}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800 }}>{[e.brand, e.model].filter(Boolean).join(' ') || e.type || 'Equipment'}</span>
                  {e.fuel_type && <span className="pill" style={{ fontSize: 9.5, color: fc, border: `1px solid ${fc}` }}>⛽ {e.fuel_type}</span>}
                  {age != null && <span className="pill" style={{ fontSize: 9.5, color: warnProb ? 'var(--amber)' : 'var(--fg-3)' }}>{age}y old</span>}
                </div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 5, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {e.type && <span>{e.type}</span>}
                  {e.serial && <span>SN {e.serial}</span>}
                  {e.capacity_gallons ? <span>{e.capacity_gallons} gal</span> : null}
                  {e.year ? <span>yr {e.year}</span> : null}
                  {e.warranty_through ? <span>warranty → {fmt(e.warranty_through)}</span> : null}
                </div>
                {e.notes && <div className="muted" style={{ fontSize: 11, marginTop: 4, fontStyle: 'italic' }}>📝 {e.notes}</div>}
                {warnProb && <div style={{ fontSize: 11, marginTop: 6, color: 'var(--amber)', fontWeight: 600 }}>⏳ {age}+ years old — flag the customer on replacement before it fails.</div>}
              </div>
            );
          })}
        </div>
      )}

      {plates.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginTop: 10 }}>
          {plates.map((p) => (
            <a key={p.id} href={p.url || '#'} target="_blank" rel="noreferrer" className="card" style={{ padding: 0, overflow: 'hidden', textDecoration: 'none', color: 'inherit' }}>
              {p.url ? <img src={p.url} alt="" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} /> : <div style={{ aspectRatio: '4/3', display: 'grid', placeItems: 'center', background: 'var(--surface-2)' }}>🔧</div>}
              <div style={{ padding: 8 }}><div style={{ fontWeight: 700, fontSize: 12 }}>{p.jobType || p.caption}</div><div className="muted" style={{ fontSize: 10 }}>{fmt(p.date)}</div></div>
            </a>
          ))}
        </div>
      ) : registry.length === 0 ? <div className="card" style={{ marginTop: 10 }}><span className="muted">No equipment captured here yet — read the plate above to put it on file.</span></div> : null}
    </div>
  );
}
