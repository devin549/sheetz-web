import { loadCockpit } from '../cockpit';
import JobHeader from '../JobHeader';
import JobForms from '../JobForms';
import { getForms } from '@/lib/qa';
import { can } from '@/lib/roles';
import { canUploadPhotos } from '../jobAccess';

export const dynamic = 'force-dynamic';

// Required forms for THIS job, derived from job type/class. Incomplete required forms block closeout
// (the closeout questions already gate; permit/warranty/photo-release are listed for the tech to complete).
function requiredForms(job) {
  const t = `${job.job_type || ''} ${job.job_class || ''}`.toLowerCase();
  const out = [];
  if (/install|excavat|dig|sewer|main|gas|water ?heater/.test(t)) out.push(['📄 Permit', 'Pull/attach the permit for this work.', true]);
  if (/warranty|insurance/.test(t) || job.warranty_provider) out.push(['🛡 Warranty claim form', 'Provider claim details + serials.', true]);
  if (/callback|re-?clog|re-?do/.test(t)) out.push(['🔁 Callback root-cause', 'What caused the repeat + the permanent fix.', true]);
  out.push(['📷 Photo / media release', 'Customer OK to use photos in their packet.', false]);
  return out;
}

export default async function FormsTab({ params }) {
  const c = await loadCockpit(params.id);
  if (!c.configured) return <div className="wrap"><div className="h1">Forms</div><div className="notice">Add <code>SUPABASE_SERVICE_ROLE_KEY</code>.</div></div>;
  const forms = await getForms(c.sb, params.id, c.job.job_type);
  const canAnswer = can(c.role, 'changeStatus') || can(c.role, 'qaReview') || canUploadPhotos(c.role);
  const req = requiredForms(c.job);

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <JobHeader job={c.job} customer={c.customer} tab="Forms" />
      <div className="card" style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>📝 Forms required for this job</div>
        <div style={{ display: 'grid', gap: 6 }}>
          {req.map(([title, desc, must]) => (
            <div key={title} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 13 }}>{title}{must ? <span style={{ color: 'var(--amber)' }}> *</span> : null}</div><div className="muted" style={{ fontSize: 11 }}>{desc}</div></div>
              {must && <span className="pill" style={{ fontSize: 10, color: 'var(--amber)' }}>blocks closeout</span>}
            </div>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Required forms + closeout questions below must be done before payment/closeout.</div>
      </div>
      <div style={{ marginTop: 10 }}>
        <JobForms jobId={params.id} forms={forms} canAnswer={canAnswer} />
      </div>
    </div>
  );
}
