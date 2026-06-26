-- 114_tech_photos.sql — tech headshots (avatar + the face in the customer "on my way" text).
alter table public.profiles add column if not exists photo_url text;

-- public bucket so the avatar + the customer tracking page can show the photo (writes go through service role).
insert into storage.buckets (id, name, public)
  values ('tech-photos', 'tech-photos', true)
  on conflict (id) do update set public = true;
