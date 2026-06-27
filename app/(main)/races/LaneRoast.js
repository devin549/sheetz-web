'use client';

// Renders the instant template roast, then (on MOUNT — i.e. only when the Races screen is actually on
// the tech's glass) fetches the AI version from /api/roast and swaps it in. Cached server-side per day,
// so this fetch is a no-token cache hit after the first open. No eyeballs → no fetch → no tokens.
import { useEffect, useState } from 'react';

export default function LaneRoast({ template, race, rank, total, hhwp = false, color }) {
  const [text, setText] = useState(template);
  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({ race, rank: String(rank), total: String(total), hhwp: hhwp ? '1' : '0' });
    fetch('/api/roast?' + q.toString()).then((r) => r.json()).then((j) => { if (alive && j && j.text) setText(j.text); }).catch(() => {});
    return () => { alive = false; };
  }, [race, rank, total, hhwp]);
  return <div style={{ fontSize: 11, marginTop: 4, fontWeight: 600, color }}>{text}</div>;
}
