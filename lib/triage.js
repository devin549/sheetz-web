// Adaptive plumbing triage — per job-type question sets (ported from the live HTML booking's
// PLUMBING TRIAGE). Pure config; the BookingTriage component renders it. Answers are stored on the
// job (jobs.triage). 'danger' options flag urgency; 'decode' wires the model# → Claude decoder.

const FLOOD_CALLOUT = {
  title: 'Possible water damage — offer FloodBusterz',
  body: 'Active water / sewage means this may need restoration (drying, moisture, Xactimate) — not just the plumbing fix. Ask if they want a FloodBusterz assessment.',
  flagKey: 'floodbusterz_flag',
  flagLabel: 'Flag this job for a FloodBusterz follow-up',
};

const WATER_HEATER = {
  id: 'water_heater',
  label: 'Water heater',
  match: /water heater/i,
  flood: FLOOD_CALLOUT,
  questions: [
    { key: 'active_leak', label: 'Active leak / flooding right now?', type: 'choice', opts: ['No', 'Yes'], danger: ['Yes'], required: true },
    { key: 'shut_off', label: 'Can they shut the water off?', type: 'choice', opts: ['Yes', 'No', 'Unsure'], required: true },
    { key: 'backup', label: 'Drain stoppage or sewage backup?', type: 'choice', opts: ['Neither', 'Drain stoppage', 'Sewage backup'], danger: ['Sewage backup'], required: true },
    { key: 'model', label: 'Model # off the rating plate (lets us bring the RIGHT unit)', type: 'decode', placeholder: 'e.g. XG40T06EC36U1 — then tap Decode' },
    { key: 'serial', label: 'Serial # (dates the unit — optional)', type: 'text', placeholder: 'optional' },
    { key: 'fuel', label: 'Fuel type?', type: 'choice', opts: ['Natural Gas', 'Propane (LP)', 'Electric', 'Unsure'], required: true },
    { key: 'tank_size', label: 'Tank size (gallons)?', type: 'choice', opts: ['30', '40', '50', '52', '55', '65', '75', '80', 'Tankless', 'Unsure'] },
    { key: 'tank_style', label: 'Tank height / style?', type: 'choice', opts: ['Tall', 'Short (Lowboy)', 'Unsure'] },
    { key: 'symptom', label: 'Main symptom?', type: 'choice', opts: ['No hot water', 'Leaking', 'Pilot / ignition', 'Noise', 'Not enough'], danger: ['Leaking'] },
    { key: 'location', label: 'Where is the unit?', type: 'text', placeholder: 'basement, garage, closet, attic…' },
  ],
};

// Lighter triage for the water-intrusion job types — same FloodBusterz logic, fewer unit questions.
const DRAIN_SEWER = {
  id: 'drain_sewer',
  label: 'Drain / sewer',
  match: /drain|sewer|clog|unclog|backup|stoppage/i,
  flood: FLOOD_CALLOUT,
  questions: [
    { key: 'active_leak', label: 'Active backup / flooding right now?', type: 'choice', opts: ['No', 'Yes'], danger: ['Yes'], required: true },
    { key: 'backup', label: 'Sewage present?', type: 'choice', opts: ['No', 'Yes'], danger: ['Yes'], required: true },
    { key: 'fixtures', label: 'How many fixtures affected?', type: 'choice', opts: ['One', 'A few', 'Whole house'] },
    { key: 'cleanout', label: 'Outside cleanout accessible?', type: 'choice', opts: ['Yes', 'No', 'Unsure'] },
    { key: 'location', label: 'Where is it backing up?', type: 'text', placeholder: 'kitchen, basement floor drain, main line…' },
  ],
};

const CONFIGS = [WATER_HEATER, DRAIN_SEWER];

// Match a service string to a triage config (null if none).
export function triageFor(service) {
  const s = String(service || '');
  return CONFIGS.find((c) => c.match.test(s)) || null;
}
