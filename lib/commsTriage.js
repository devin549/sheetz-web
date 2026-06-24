// Comms Desk triage — turns raw #sheetz chatter into "what happened, who owns it, what's the next step".
// Rule-based so it's instant + free (AI thread-summaries are a phase-2 layer on top).

// Order matters: first match wins (most urgent / specific first).
const RULES = [
  { key: 'urgent',   test: /\b(urgent|asap|emergency|right now|need .* now|!!!|911)\b/i },
  // On-call / coverage rotation — checked before meeting/helper so "on call this week … Helper this week"
  // reads as the schedule, not a helper request.
  { key: 'oncall',   test: /\bon[ -]?call\b|\bstandby\b|\bcoverage (this week|schedule)\b|\brotation\b/i },
  { key: 'meeting',  test: /\b(meeting|huddle|training|all[ -]hands|safety (meeting|talk)|tailgate (meeting|talk)|gather (up|everyone)|standup|stand[ -]up)\b/i },
  { key: 'helper',   test: /\b(helper|need a hand|2[ -]?man|two[ -]?man|extra hand|cover(age)?|anyone (free|available)|hands? available|second (set of )?hands)\b/i },
  { key: 'tool',     test: /\b(tool|camera|seesnake|locator|aug(er|ar)|jett?er|reel|snake|machine|k-?60|ridgid|missing .*tool|has my)\b/i },
  { key: 'fuel_shop',test: /\b(fuel|gas|speedway|diesel|shop|parts?|material|stock|warehouse|pick ?up)\b/i },
  { key: 'customer', test: /\b(customer|complaint|upset|angry|unhappy|review|refund|callback|call back|mad|pissed)\b/i },
  { key: 'schedule', test: /\b(schedul|reschedul|running late|gonna be late|be late|eta|push (back|it)|move (the )?(job|appt|appointment)|delay)\b/i },
];

export const LABELS = {
  urgent:    { label: 'Urgent',         color: '#e5484d', route: { href: '/dispatch',      text: 'Dispatch board' } },
  oncall:    { label: '☎️ On-call',     color: '#46a758', route: { href: '/dispatch',      text: 'Dispatch board' } },
  meeting:   { label: '📅 Meeting',     color: '#12a594', route: { href: '/meetings',      text: 'Meetings' } },
  helper:    { label: 'Helper needed',  color: '#f5a524', route: { href: '/crews',         text: 'Crews' } },
  tool:      { label: 'Tool issue',     color: '#9b8afb', route: { href: '/tool-checkout', text: 'Tool Check-Out' } },
  fuel_shop: { label: 'Fuel / shop',    color: '#30a46c', route: { href: '/shop',          text: 'Shop' } },
  customer:  { label: 'Customer issue', color: '#e5484d', route: { href: '/accounts',      text: 'Customers' } },
  schedule:  { label: 'Schedule',       color: '#0091ff', route: { href: '/dispatch',      text: 'Dispatch board' } },
};
// Labels that mean "someone needs to do something."
export const ACTIONABLE = new Set(['urgent', 'helper', 'tool', 'customer', 'schedule']);

// Classify one message body → a label key (or null). Inbound-only is the caller's job.
export function labelFor(text) {
  const s = String(text || '');
  for (const r of RULES) if (r.test.test(s)) return r.key;
  return null;
}

// Initials for the avatar fallback: "Kota Schmidt" → "KS", "Devin" → "DE".
export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Stable color for an avatar from a name (so each person keeps the same hue).
export function avatarHue(name) {
  let h = 0; const s = String(name || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
