// 🚗 Inter-job drive leg (HTML My Day "12 min drive · 5.4 mi from Jane's"). Rendered between job cards;
// the longest/backtrack leg of the day turns amber so the office can spot route inefficiency. Estimated
// from job coordinates (haversine→ETA) until live Google drive-times wire in.
export default function DriveLeg({ min, miles, fromName, long = false }) {
  const m = Math.round(min);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0 3px 14px', fontSize: 10.5, color: long ? 'var(--amber)' : 'var(--fg-3)' }}>
      <span style={{ fontSize: 13 }}>{long ? '⚠' : '🚗'}</span>
      <span>
        {long ? <strong>{m} min drive · {Math.round(miles)} mi</strong> : <>{m} min drive · {miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi</>}
        {fromName ? <> from {fromName}’s</> : ''}{long ? ' — longest leg today' : ''}
      </span>
    </div>
  );
}
