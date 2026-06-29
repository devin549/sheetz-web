-- Office-authored job tags: free-text labels the office puts on a job (e.g. "gate code 4421", "2 dogs
-- friendly", "proof needed", "no balance", "water heater install"). Shown on the tech's My Day card next to
-- the auto-derived tags; certain tags auto-trigger forms (see lib/jobTags OFFICE_TAG_FORMS — e.g. a
-- "water heater" tag adds the Water Heater Install form to the Forms tab).
alter table public.jobs add column if not exists office_tags text[] not null default '{}';
