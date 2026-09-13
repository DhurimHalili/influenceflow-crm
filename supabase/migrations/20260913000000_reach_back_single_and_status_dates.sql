-- Reach-backs become one pipeline status ("reach_back") instead of 1/2/3,
-- and status changes get their own timestamp so the CRM can show
-- "date added" and "date the status was updated" separately.

alter table public.creators
  add column if not exists status_updated_at timestamptz;

alter table public.brand_contacts
  add column if not exists status_updated_at timestamptz;

-- Collapse legacy reach-back stages into the single status
update public.creators
set pipeline_status = 'reach_back'
where pipeline_status in ('reach_back_1', 'reach_back_2', 'reach_back_3');

update public.brand_contacts
set pipeline_status = 'reach_back'
where pipeline_status in ('reach_back_1', 'reach_back_2', 'reach_back_3');

-- Seed the status timestamp from the last row update (best available history)
update public.creators
set status_updated_at = coalesce(updated_at, created_at)
where status_updated_at is null;

update public.brand_contacts
set status_updated_at = coalesce(updated_at, created_at)
where status_updated_at is null;
