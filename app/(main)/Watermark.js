'use client';

import { useEffect, useState } from 'react';

// DLP leak-trace watermark — tiled, faint, diagonal identity over INTERNAL tech screens, so any
// screenshot/photo of the iPad traces back to WHO and WHEN. Deter + trace, never auto-discipline (the
// owner reviews; this just makes a leak attributable). A browser/PWA cannot truly BLOCK an OS screenshot
// — visible attribution is the realistic control. pointer-events:none so it never blocks taps.
// Theme-aware: the gray was tuned for dark; on the light cream cockpit it must be even fainter so it's
// barely perceptible in normal use but still readable in a zoomed-in leak.
export default function Watermark({ label }) {
  const [light, setLight] = useState(false);
  useEffect(() => {
    const read = () => setLight(document.documentElement.getAttribute('data-theme') === 'light');
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  if (!label) return null;
  // Tuned to SURVIVE a social-media repost (compression) while staying low-contrast in normal use:
  // on light cream a warm tan that blends with the background, on dark a soft gray. The reveal tool
  // (owner-only) boosts contrast to read it back off a leaked image.
  const fill = light ? 'rgba(168,150,116,0.06)' : 'rgba(155,155,155,0.052)';
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='360' height='190'>` +
    `<text x='8' y='120' transform='rotate(-28 8 120)' fill='${fill}' font-size='13' font-family='monospace' font-weight='700'>${label}</text></svg>`;
  const uri = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 9998, pointerEvents: 'none', backgroundImage: uri, backgroundRepeat: 'repeat' }} />
  );
}
