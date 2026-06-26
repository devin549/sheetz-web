// One-off local seed for the Test Tech so the cockpit/My Day render with rich data.
// Run: node _seedtest.cjs   (reads .env.local manually, no dotenv dep)
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = {};
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const TECH_NAME = 'Test Tech';
const TECH_EMAIL = 'testtech@clogbusterzplumbing.com';
function todayAt(h, m = 0) { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); }
function minsAgo(n) { return new Date(Date.now() - n * 60000).toISOString(); }

(async () => {
  // tag every SEEDTEST row so cleanup is trivial
  const TAG = 'SEEDTEST';

  // customers
  const customers = [
    { name: 'Marcy Whitfield', address: '418 Lakeshore Dr, Richmond, KY', phone: '859-555-0142', email: 'marcy@example.com' },
    { name: 'Tom Beasley', address: '77 Old Pike Rd, Berea, KY', phone: '859-555-0199', email: 'tom.b@example.com' },
    { name: 'Rivermark HOA (Unit 12)', address: '12 Rivermark Ct, Lexington, KY', phone: '859-555-0234', email: 'ap@rivermark.example' },
  ];
  const custIds = [];
  for (const c of customers) {
    const { data, error } = await sb.from('customers').insert({ ...c }).select('id').single();
    if (error) { console.error('customer', c.name, error.message); custIds.push(null); }
    else custIds.push(data.id);
  }
  console.log('customers:', custIds);

  const jobs = [
    {
      // ACTIVE — on-site water heater install for a member (equipment + permit + member tags)
      job_number: 'CB-4471', job_type: 'Water Heater Install', job_class: 'residential',
      status: 'on_site', priority: 'high', amount: 2850,
      scheduled_at: todayAt(9, 0), enroute_at: minsAgo(95), started_at: minsAgo(70),
      customer_id: custIds[0], tech_name: TECH_NAME, tech_email: TECH_EMAIL,
      notes: 'SEEDTEST — 50gal gas, old unit leaking. Snap data plate (NATURAL vs LP). Dogs in back yard.',
      access_notes: 'Gate code 4412. Friendly lab named Biscuit — announce yourself.',
      lat: 37.7479, lng: -84.2947,
    },
    {
      // UPCOMING — callback re-clog, prefers text
      job_number: 'CB-4472', job_type: 'Drain Callback — Kitchen Re-clog', job_class: 'residential',
      status: 'scheduled', priority: 'normal', amount: 0,
      scheduled_at: todayAt(13, 30),
      customer_id: custIds[1], tech_name: TECH_NAME, tech_email: TECH_EMAIL,
      notes: 'SEEDTEST — callback from last week, same kitchen line. Customer prefers text over calls.',
      access_notes: 'Texts only please.',
    },
    {
      // UPCOMING — commercial PO job, project size
      job_number: 'CB-4473', job_type: 'Sewer Main Repipe (Project)', job_class: 'commercial',
      status: 'scheduled', priority: 'high', amount: 8600,
      scheduled_at: todayAt(15, 30),
      customer_id: custIds[2], tech_name: TECH_NAME, tech_email: TECH_EMAIL,
      notes: 'SEEDTEST — recurring root intrusion, cast iron. Reline/replacement opportunity. Net 30, get PO#.',
      access_notes: 'Property mgr meets you — PO number required, no cash on site.',
    },
    {
      // DONE — finished earlier today
      job_number: 'CB-4470', job_type: 'Toilet Reset', job_class: 'residential',
      status: 'complete', priority: 'normal', amount: 240,
      scheduled_at: todayAt(7, 30), enroute_at: minsAgo(330), started_at: minsAgo(300), completed_at: minsAgo(250),
      customer_id: custIds[0], tech_name: TECH_NAME, tech_email: TECH_EMAIL,
      notes: 'SEEDTEST — wax ring + reset, done.',
    },
  ];

  const ids = [];
  for (const j of jobs) {
    const { data, error } = await sb.from('jobs').insert(j).select('id').single();
    if (error) { console.error('job', j.job_number, error.message); }
    else { ids.push(data.id); console.log('job', j.job_number, '→', data.id, j.status); }
  }
  console.log('\nACTIVE cockpit URL: /job/' + ids[0]);
})();
