-- What the member confirmed on a brand's LinkedIn page (owner's rule, Nov 2026): LinkedIn can't be read by a
-- server, so the brand profile opens the company page and the member taps the "Company size" band it shows.
-- {linkedin_size: "51-200", at: timestamp}. The final say on company size; RLS + the restrictive policy on
-- brands already cover it (the member's own row).
alter table public.brands add column if not exists company_check jsonb;
