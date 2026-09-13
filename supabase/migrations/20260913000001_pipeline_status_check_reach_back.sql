-- The tables carried check constraints listing reach_back_1/2/3, which blocked
-- the single reach_back status (and silently failed status updates in the app).
-- Widen both constraints to the new status list and normalize legacy rows.

alter table public.creators
  drop constraint if exists creators_pipeline_status_check;

alter table public.brand_contacts
  drop constraint if exists brand_contacts_pipeline_status_check;

alter table public.creators
  add constraint creators_pipeline_status_check
  check (pipeline_status = ANY (ARRAY[
    'new'::text, 'contacted'::text, 'reach_back'::text, 'replied'::text,
    'negotiating'::text, 'roster'::text, 'signed'::text, 'denied'::text, 'no_reply'::text
  ]));

alter table public.brand_contacts
  add constraint brand_contacts_pipeline_status_check
  check (pipeline_status = ANY (ARRAY[
    'new'::text, 'contacted'::text, 'reach_back'::text, 'replied'::text,
    'negotiating'::text, 'roster'::text, 'denied'::text, 'no_reply'::text
  ]));

update public.creators
set pipeline_status = 'reach_back'
where pipeline_status in ('reach_back_1', 'reach_back_2', 'reach_back_3');

update public.brand_contacts
set pipeline_status = 'reach_back'
where pipeline_status in ('reach_back_1', 'reach_back_2', 'reach_back_3');
