import Link from 'next/link';

export const dynamic = 'force-dynamic';

// Honest placeholder for cockpit items still being ported from the live Google Sheets. The nav
// shows the full office structure; this page marks what's on the way so nothing is hidden.
export default function Soon({ searchParams }) {
  const screen = (searchParams?.screen || 'This screen').toString().slice(0, 80);
  return (
    <div className="wrap">
      <div className="card card-amber" style={{ textAlign: 'center', padding: '34px 20px' }}>
        <div style={{ fontSize: 34 }}>🛠️</div>
        <div className="h1" style={{ marginTop: 8 }}>{screen}</div>
        <p className="muted" style={{ maxWidth: 460, margin: '8px auto 0', lineHeight: 1.55 }}>
          This screen is <strong>porting from the live sheets</strong> — the workflow and data are being
          rebuilt here so it matches what the Google Sheet does today. It&apos;s on the roadmap, not lost.
        </p>
        <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/" className="btn">← Back to Home</Link>
          <Link href="/board" className="pill" style={{ padding: '10px 16px' }}>Dispatch Board</Link>
        </div>
      </div>
    </div>
  );
}
