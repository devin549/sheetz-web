import Link from 'next/link';

// 🧭 Today Flow — the at-a-glance strip at the top of My Day (screenshot 1): where you ARE now → what's
// NEXT → and a one-tap into the tool/part locator. Pure presentational (links only, no client state); the
// data is already computed on the page (active job + next leg). The Tool tile lands on /tools, which
// auto-detects the active job and grabs live GPS to rank the closest available source — so we don't
// duplicate the locate logic here, we just open the door to it.

const CB_TZ = 'America/New_York';
function fmtTime(iso) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleTimeString('en-US', { timeZone: CB_TZ, hour: 'numeric', minute: '2-digit' }); } catch { return null; }
}
function nowLabel(status) {
  const s = String(status || '').toLowerCase();
  if (/on_?site/.test(s)) return { text: 'ON SITE NOW', tone: 'var(--green-bright)' };
  if (/enroute|rolling/.test(s)) return { text: 'EN ROUTE', tone: 'var(--amber)' };
  return { text: 'UP FIRST', tone: 'var(--amber)' };
}

const tile = (accent) => ({
  flex: '1 1 150px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3,
  padding: '10px 12px', borderRadius: 12, textDecoration: 'none', color: 'inherit',
  background: 'var(--surface-1)', border: '1px solid var(--border)', borderTop: `3px solid ${accent}`,
});
const cap = { fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' };
const big = { fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const sub = { fontSize: 11, color: 'var(--fg-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

export default function TodayFlow({ current, next }) {
  if (!current) return null;
  const now = nowLabel(current.status);
  const curTime = fmtTime(current.time);
  const nextTime = next ? fmtTime(next.time) : null;

  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
      {/* NOW — the job you're on (or up first). Whole tile opens the job. */}
      <Link href={`/job/${current.id}`} style={tile(now.tone)}>
        <span style={{ ...cap, color: now.tone }}>📍 {now.text}</span>
        <span style={big}>{current.name}</span>
        <span style={sub}>{curTime ? `${curTime} · ` : ''}tap to open the job →</span>
      </Link>

      {/* NEXT — the stop after this one, with drive time. "Last stop" when there's nothing after. */}
      {next ? (
        <Link href={`/job/${next.id}`} style={tile('var(--border-strong)')}>
          <span style={{ ...cap, color: 'var(--fg-2)' }}>⏭ up next</span>
          <span style={big}>{next.customer}</span>
          <span style={sub}>{nextTime || '—'}{next.driveMin != null ? ` · ${Math.round(next.driveMin)}-min drive` : ''}</span>
        </Link>
      ) : (
        <div style={tile('var(--border-strong)')}>
          <span style={{ ...cap, color: 'var(--fg-2)' }}>⏭ up next</span>
          <span style={big}>Last stop 🎉</span>
          <span style={sub}>nothing after this one</span>
        </div>
      )}

      {/* TOOL — one tap into the locator: closest available van/shop/vendor + Maps route, tied to this job. */}
      <Link href="/tools" style={tile('var(--purple, #9c64f4)')}>
        <span style={{ ...cap, color: 'var(--purple, #9c64f4)' }}>🔧 tool nearby</span>
        <span style={big}>Need a part or tool?</span>
        <span style={sub}>find the closest source →</span>
      </Link>
    </div>
  );
}
