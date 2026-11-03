-- Agency brief for every brand: what creators they want (niches, platforms,
-- formats, creator size), budget and deal terms, audience and goals — plus
-- the brand's own social profiles. Additive only; no data is touched.
alter table public.brands
  add column if not exists brief jsonb not null default '{}'::jsonb,
  add column if not exists socials jsonb not null default '[]'::jsonb;
