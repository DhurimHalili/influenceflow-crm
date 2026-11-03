-- Email drafts for brands, manual engagement rating, saved email templates
-- and custom scoring weights. Purely additive and idempotent: safe to run on
-- any deploy, existing rows keep every value they already have.

-- Creators: the engagement score becomes a manual 0-5 rating (it used to be
-- derived from engagement_rate). draft_subject / draft_body already exist on
-- creators from the original outreach module; they are reused as-is.
alter table public.creators add column if not exists stars_engagement integer not null default 0;
alter table public.creators add column if not exists draft_subject text;
alter table public.creators add column if not exists draft_body text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'creators_stars_engagement_check') then
    alter table public.creators
      add constraint creators_stars_engagement_check check (stars_engagement between 0 and 5);
  end if;
end $$;

-- Brands: per-brand pitch draft + real status-change timestamp (parity with
-- creators, used by the "last status change" stat and stale-lead checks).
alter table public.brands add column if not exists draft_subject text;
alter table public.brands add column if not exists draft_body text;
alter table public.brands add column if not exists status_updated_at timestamptz;
update public.brands set status_updated_at = coalesce(updated_at, created_at, now()) where status_updated_at is null;

-- Profiles: reusable email templates and optional custom rating weights
-- (null = market-standard defaults defined in the app).
alter table public.profiles add column if not exists email_templates jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists rating_weights jsonb;

-- Meetings: tasks and reminders can be checked off.
alter table public.meetings add column if not exists done boolean not null default false;
