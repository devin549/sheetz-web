-- Customer search that matches phones regardless of formatting. Phones are stored like
-- "(859) 779-8824"; typing "8597798824" must still find them. Strips non-digits from BOTH the
-- stored phone and the search term. Idempotent. Run in the Supabase SQL editor.
create or replace function public.search_customers(term text)
returns table (
  id uuid, name text, phone text, address text,
  cb_number bigint, lifetime_revenue numeric, lifetime_jobs integer,
  last_job_completed date, do_not_service boolean
)
language sql stable as $$
  select c.id, c.name, c.phone, c.address,
         c.cb_number::bigint, c.lifetime_revenue::numeric, c.lifetime_jobs::integer,
         c.last_job_completed::date, c.do_not_service::boolean
  from public.customers c
  where c.name ilike '%' || term || '%'
     or (
       length(regexp_replace(coalesce(term, ''), '\D', '', 'g')) >= 4
       and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g')
           ilike '%' || regexp_replace(term, '\D', '', 'g') || '%'
     )
  order by c.lifetime_revenue desc nulls last
  limit 15;
$$;
