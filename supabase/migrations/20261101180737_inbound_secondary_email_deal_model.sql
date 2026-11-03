-- 1. "Inbound" pipeline status: a brand or creator reached out to YOU
--    (website form, DM, email). Widen the status checks on every table that
--    carries a pipeline status. Legacy 'reach_back' stays allowed so old rows
--    never block a save.
-- 2. Optional secondary email (+ a free label such as "Brand manager",
--    "Agent", "Assistant") on influencers and brands.
-- 3. Campaign deal model: 'fixed' = you agree a fee with the creator and
--    pitch the brand a higher price (profit = brand price − creator fees);
--    'percent' = the creator gets a share of the deal. Existing campaigns stay
--    'percent' so their numbers never change. creator_fees holds the fee per
--    creator id for the fixed model.
-- Additive and idempotent.

alter table public.creators drop constraint if exists creators_pipeline_status_check;
alter table public.creators add constraint creators_pipeline_status_check
  check (pipeline_status = any (array['new','inbound','contacted','reach_back','replied','negotiating','roster','signed','denied','no_reply']::text[]));

alter table public.brands drop constraint if exists brands_pipeline_status_check;
alter table public.brands add constraint brands_pipeline_status_check
  check (pipeline_status = any (array['new','inbound','contacted','reach_back','replied','negotiating','roster','signed','denied','no_reply']::text[]));

alter table public.brand_contacts drop constraint if exists brand_contacts_pipeline_status_check;
alter table public.brand_contacts add constraint brand_contacts_pipeline_status_check
  check (pipeline_status = any (array['new','inbound','contacted','reach_back','replied','negotiating','roster','signed','denied','no_reply']::text[]));

alter table public.creators add column if not exists secondary_email text not null default '';
alter table public.creators add column if not exists secondary_email_label text not null default '';
alter table public.brands add column if not exists secondary_email text not null default '';
alter table public.brands add column if not exists secondary_email_label text not null default '';

alter table public.campaigns add column if not exists payout_model text not null default 'percent';
alter table public.campaigns add column if not exists creator_fees jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campaigns_payout_model_check') then
    alter table public.campaigns add constraint campaigns_payout_model_check check (payout_model in ('percent', 'fixed'));
  end if;
end $$;
