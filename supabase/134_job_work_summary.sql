-- 📝 Work summary — the tech's "what I did" narrative (AI-watched), shown as DESCRIPTION OF WORK on the
-- invoice. Append-only, safe to re-run.
alter table public.jobs add column if not exists work_summary text;
