import Link from 'next/link';
import { getSupabaseAdmin, isAdminConfigured } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import { loadProfile } from '@/lib/profile';

export const dynamic = 'force-dynamic';

const fmtTime = (iso) => { try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
const statusPill = (s) => { const x = String(s || '').toLowerCase(); if (/on_?site/.test(x)) return ['ON-SITE', 'var(--green)']; if (/enroute|rolling/.test(x)) return ['EN ROUTE', 'var(--blue)']; if (/done|complete|closed/.test(x)) return ['DONE', 'var(--fg-3)']; return ['SCHEDULED', 'var(--amber)']; };

// Reached when a tech taps Proof with no active job. Instead of a dead end, this is a real PICKER —
// today's jobs as tappable cards (Proof / cockpit live inside the job).
export default async function PickAJob() {
  let jobs = [];
  if (isAdminConfigured) {
    try {
      const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser();
      const profile = user ? await loadProfile(user) : null;
      if (profile?.tech_id) {
        const start = new Date(); start.setHours(0, 0, 0, 0);
        const end = new Date(); end.setHours(23, 59, 59, 999);
        const sb = getSupabaseAdmin();
        let q = await sb.from('jobs').select('id, job_number, status, scheduled_at, job_type, customers(name, address)').eq('tech_id', profile.tech_id).gte('scheduled_at', start.toISOString()).lte('scheduled_at', end.toISOString()).order('scheduled_at', { ascending: true });
        if (q.error) q = await sb.from('jobs').select('id, job_number, status, scheduled_at, job_type, customers(name, address)').eq('tech_id', profile.tech_id).order('scheduled_at', { ascending: true }).limit(8);
        jobs = q.data || [];
      }
    } catch (_) {}
  }

  return (
    <div className="wrap" style={{ maxWidth: 520 }}>
      <div className="h1" style={{ fontSize: 20 }}>👆 Pick a job</div>
      <p className="muted" style={{ fontSize: 13 }}>Proof, parts, and the cockpit live inside a job. Tap one to open it.</p>

      {jobs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 36 }}>🗓</div>
          <div style={{ fontWeight: 700, marginTop: 6 }}>No jobs on your board right now.</div>
          <Link href="/my-day" className="btn" style={{ display: 'inline-block', marginTop: 12 }}>Open My Day</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          {jobs.map((j) => {
            const c = j.customers || {}; const [label, color] = statusPill(j.status);
            return (
              <Link key={j.id} href={`/job/${j.id}`} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
                <div style={{ textAlign: 'center', minWidth: 52 }}><div style={{ fontWeight: 800, fontSize: 13 }}>{fmtTime(j.scheduled_at)}</div></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name || 'Customer'}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{j.job_type || 'Job'}{c.address ? ` · ${c.address}` : ''}</div>
                </div>
                <span className="pill" style={{ fontSize: 9.5, color, border: `1px solid ${color}` }}>{label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
