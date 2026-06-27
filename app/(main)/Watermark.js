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
  // Light cream → a warm low-contrast tone at low opacity; dark → soft gray. Both barely visible.
  const fill = light ? 'rgba(120,108,86,0.035)' : 'rgba(150,150,150,0.045)';
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='360' height='190'>` +
    `<text x='8' y='120' transform='rotate(-28 8 120)' fill='${fill}' font-size='13' font-family='monospace' font-weight='700'>${label}</text></svg>`;
  const uri = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 9998, pointerEvents: 'none', backgroundImage: uri, backgroundRepeat: 'repeat' }} />
  );
}
