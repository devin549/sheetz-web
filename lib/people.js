// Map a login email → a person's display name for "by" / "logged by" labels.
// Add team members here as you hire; unknown emails fall back to a prettified local-part.
const NAMES = {
  'devin@clogbusterzplumbing.com': 'Devin Tackett',
  'accounting@clogbusterzplumbing.com': 'Accounting',
  // 'ashley@clogbusterzplumbing.com': 'Ashley Payne',
  // 'tracey@clogbusterzplumbing.com': 'Tracey Mills',
  // 'ronnie@clogbusterzplumbing.com': 'Ronnie Mchone',
};

export function personName(email) {
  if (!email) return '—';
  const e = String(email).toLowerCase().trim();
  if (NAMES[e]) return NAMES[e];
  const local = e.split('@')[0].replace(/[._-]+/g, ' ').trim();
  return local ? local.replace(/\b\w/g, (c) => c.toUpperCase()) : '—';
}
