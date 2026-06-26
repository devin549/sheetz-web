// My Truck · Maintenance logic (HTML van pane). Oil-change tracking + the AI keep/watch/replace call.
// Pure — pass the maintenance row + service log.

export function oilStatus(m = {}) {
  const interval = Number(m.oil_interval) || 5000;
  const cur = Number(m.current_mileage), last = Number(m.last_oil_mileage);
  if (!Number.isFinite(cur) || !Number.isFinite(last)) return { known: false };
  const nextDue = last + interval;
  const milesToGo = nextDue - cur;
  return { known: true, interval, nextDue, milesToGo, due: milesToGo <= 0, soon: milesToGo > 0 && milesToGo <= 500 };
}

// Keep / Watch / Replace from repair spend over the last 12 months. (The HTML frames it as cost-per-mile;
// without reliable 12-mo mileage we judge on annual repair spend — same call, simpler inputs.)
export function vanHealth({ repair12moCents = 0, year } = {}) {
  const spend = Math.round((Number(repair12moCents) || 0) / 100);
  const age = year ? (new Date().getFullYear() - Number(year)) : null;
  let tier = 'keep';
  if (spend >= 3500 || (age != null && age >= 10 && spend >= 2000)) tier = 'replace';
  else if (spend >= 1800) tier = 'watch';
  const meta = {
    keep: { label: 'KEEP', color: 'var(--green)', note: 'still cheaper to run than replace.' },
    watch: { label: 'WATCH', color: 'var(--amber)', note: 'repairs are climbing — keep an eye on it.' },
    replace: { label: 'REPLACE', color: 'var(--red)', note: 'repair cost says it’s time to plan a swap.' },
  }[tier];
  return { tier, ...meta, spend, age };
}
