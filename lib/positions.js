// Field roster positions (techs.position) — the real CB job titles. `field: true` means this person
// TAKES JOBS, so they show in the Job Booking tech picker + as a board row. `field: false` = office/
// management, off the board. NOTE: this only controls board/picker eligibility — what someone can SEE
// (financials, growth intel) is the LOGIN ROLE (lib/roles.js), set under "Current logins" on /team.

export const POSITIONS = [
  { id: 'tech', label: 'Tech', field: true },
  { id: 'helper', label: 'Helper', field: true },
  { id: 'salesman', label: 'Salesman', field: true },
  { id: 'field_supervisor', label: 'Field Supervisor', field: true },
  { id: 'general_manager', label: 'General Manager', field: true },
  { id: 'owner', label: 'Owner', field: true },
  { id: 'dispatcher', label: 'Dispatcher', field: false },
  { id: 'office_manager', label: 'Office Manager', field: false },
  { id: 'accounting', label: 'Accounting', field: false },
  { id: 'shop', label: 'Shop', field: false },
  { id: 'office', label: 'Office (no jobs)', field: false },
  { id: 'terminated', label: 'Terminated', field: false },
];

export const POSITION_IDS = POSITIONS.map((p) => p.id);
export const FIELD_POSITIONS = POSITIONS.filter((p) => p.field).map((p) => p.id);
export const positionLabel = (id) => (POSITIONS.find((p) => p.id === id) || {}).label || id;
