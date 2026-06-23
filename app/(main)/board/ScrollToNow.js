'use client';

import { useEffect } from 'react';

// On load, scroll the (wide, 24-hour) grid so the current hour is in view — start a hair
// before "now" so the next jobs are visible. Emergencies at any hour stay reachable by scrolling.
export default function ScrollToNow({ hour, totalHours, containerId }) {
  useEffect(() => {
    const el = document.getElementById(containerId);
    if (!el) return;
    const frac = Math.max(0, (hour - 1) / totalHours);
    el.scrollLeft = frac * (el.scrollWidth - el.clientWidth);
  }, [hour, totalHours, containerId]);
  return null;
}
