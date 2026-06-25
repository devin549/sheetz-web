'use client';

// DLP leak-trace watermark — tiled, faint, diagonal identity over every internal tech screen, so any
// screenshot/photo of the iPad traces back to WHO and WHEN. Deter + trace, never auto-discipline (the
// owner reviews; this just makes a leak attributable). A browser/PWA cannot truly BLOCK an OS screenshot
// — visible attribution is the realistic, effective control. pointer-events:none so it never blocks taps.
export default function Watermark({ label }) {
  if (!label) return null;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='360' height='190'>` +
    `<text x='8' y='120' transform='rotate(-28 8 120)' fill='rgba(140,140,140,0.055)' font-size='13' font-family='monospace' font-weight='700'>${label}</text></svg>`;
  const uri = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 9998, pointerEvents: 'none', backgroundImage: uri, backgroundRepeat: 'repeat' }} />
  );
}
