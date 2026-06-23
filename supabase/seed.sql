-- Sheetz web app — SEED sample data into your EXISTING tables.
-- Your Supabase already has jobs / customers / techs (relational: jobs link to customers + techs
-- by id). They're just empty. This drops in a few sample rows so the "My Day" screen shows something.
--
-- Run in Supabase → SQL Editor → New query → paste → Run. Idempotent (safe to re-run).

-- techs
insert into techs (name, active)
select v.name, true
from (values ('Matt Shepard'), ('Joe Brashear')) as v(name)
where not exists (select 1 from techs t where t.name = v.name);

-- customers
insert into customers (name, email, address)
select v.name, v.email, v.address
from (values
  ('Jane Smith',   'jane@example.com', '123 Oak St, Richmond'),
  ('Bob Johnson',  'bob@example.com',  '45 Maple Ave, Richmond'),
  ('Acme Offices', 'ap@acme.com',      '900 Commerce Dr, Lexington')
) as v(name, email, address)
where not exists (select 1 from customers c where c.name = v.name);

-- jobs (today, linked to the customers + tech above)
insert into jobs (customer_id, tech_id, status, scheduled_at)
select c.id, t.id, v.status, v.sched
from (values
  ('Jane Smith',   'Matt Shepard', 'scheduled', (now()::date + time '08:00')),
  ('Bob Johnson',  'Matt Shepard', 'enroute',   (now()::date + time '10:30')),
  ('Acme Offices', 'Matt Shepard', 'scheduled', (now()::date + time '13:00'))
) as v(cust, tech, status, sched)
join customers c on c.name = v.cust
join techs t on t.name = v.tech
where not exists (
  select 1 from jobs j where j.customer_id = c.id and j.scheduled_at = v.sched
);
