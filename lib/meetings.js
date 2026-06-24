// Resolve a meeting audience → the list of people required to acknowledge.
// audience values:
//   'everyone'      → all active field crew
//   'mgr:<name>'    → the techs/helpers that supervisor manages (techs.supervisor)
//   '<crew name>'   → everyone on that crew (techs.crew)
export function requiredNames(fieldRoster, audience) {
  const a = String(audience || 'everyone');
  if (a === 'everyone') return fieldRoster.map((t) => t.name);
  if (a.startsWith('mgr:')) {
    const mgr = a.slice(4).toLowerCase();
    return fieldRoster.filter((t) => String(t.supervisor || '').toLowerCase() === mgr).map((t) => t.name);
  }
  return fieldRoster.filter((t) => (t.crew || '') === a).map((t) => t.name);
}

// Friendly label for an audience value (for display).
export function audienceLabel(audience) {
  const a = String(audience || 'everyone');
  if (a === 'everyone') return 'Everyone';
  if (a.startsWith('mgr:')) return `${a.slice(4)}’s crew`;
  return `${a} crew`;
}
