import { requireHref } from '@/lib/guard';
import { isAiConfigured } from '@/lib/anthropic';
import HankChat from './HankChat';

export const dynamic = 'force-dynamic';

export default async function Hank() {
  const { role } = await requireHref('/hank');
  const ready = isAiConfigured(role);

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <div className="h1">🪠 Hank <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· the plumber’s brain</span></div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Field answers — water heaters, drains &amp; sewer, fixtures, gas, backflow, KY code, manufacturer specs. Ask like you’re standing on the job.</p>
      {!ready && <div className="notice" style={{ color: 'var(--amber)' }}>No Claude key for your role yet — add an <code>ANTHROPIC_KEY_*</code> in Vercel and Hank wakes up.</div>}
      <HankChat />
    </div>
  );
}
