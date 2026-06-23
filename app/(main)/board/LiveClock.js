'use client';

import { useEffect, useState } from 'react';

// Renders the date + time in the VIEWER's local timezone (the office is Eastern), ticking each
// minute. Server-rendering this would use Vercel's UTC clock — hence the wrong time.
export default function LiveClock() {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  if (!now) return <span className="muted" style={{ fontSize: 13 }}>&nbsp;</span>;
  return (
    <span className="muted" style={{ fontSize: 13 }}>
      {now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
    </span>
  );
}
