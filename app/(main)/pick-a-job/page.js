import Link from 'next/link';

export const dynamic = 'force-dynamic';

// Shown when a tech taps Photos / Tools with no job in context. Photos + Tools are job-specific.
export default function PickAJob() {
  return (
    <div className="wrap" style={{ maxWidth: 480, textAlign: 'center', paddingTop: 60 }}>
      <div style={{ fontSize: 48 }}>👆</div>
      <div className="h1" style={{ marginTop: 8 }}>Pick a job first</div>
      <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>Photos and Tools are tied to a specific job. Open today’s schedule and tap a job — its Photos and Tools live inside that Job Cockpit.</p>
      <Link href="/my-day" className="btn" style={{ display: 'inline-block', marginTop: 12 }}>🗓 Open My Day</Link>
    </div>
  );
}
