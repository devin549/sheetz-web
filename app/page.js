import Link from 'next/link';
import { isSupabaseConfigured } from '@/lib/supabaseClient';

export default function Home() {
  return (
    <div className="wrap">
      <div className="h1">CB web app — foundation</div>
      <p className="muted">
        The new Clog Busterz stack: Next.js on Vercel, data in Supabase. This is the beachhead —
        the tech iPad <strong>My Day</strong> screen, ported to the new stack to prove the pipeline.
      </p>

      <div style={{ margin: '18px 0', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link className="btn" href="/my-day">📋 Tech · My Day →</Link>
        <Link className="btn" href="/customers">🔎 Customers →</Link>
      </div>

      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Status</div>
        <div className="muted">
          Supabase connection: {isSupabaseConfigured
            ? <span style={{ color: 'var(--green)' }}>configured ✓</span>
            : <span style={{ color: 'var(--amber)' }}>not set yet — add your keys (see README)</span>}
        </div>
      </div>

      <p className="muted" style={{ marginTop: 18 }}>
        Roadmap: My Day → job detail → photos → My Truck/tools → van check → then the dispatch board.
        See <code>docs/WEB_MIGRATION_PLAN.md</code>.
      </p>
    </div>
  );
}
