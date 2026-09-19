-- 20260919000001_deal_loss.sql
-- Perfect deal-loss tracking. A deal exists only once two-way engagement
-- happened (replied or beyond); rejecting an untouched lead is NOT a loss.
-- lost_at is stamped by the app exactly when a replied+ entity moves to
-- denied (campaigns: cancelled). Existing denied rows are grandfathered
-- (lost_at stays NULL) so history is never guessed. Additive only.

alter table public.creators
  add column if not exists lost_reason text not null default '',
  add column if not exists lost_at timestamptz;

alter table public.brands
  add column if not exists lost_reason text not null default '',
  add column if not exists lost_at timestamptz;

alter table public.brand_contacts
  add column if not exists lost_reason text not null default '',
  add column if not exists lost_at timestamptz;

alter table public.campaigns
  add column if not exists lost_reason text not null default '',
  add column if not exists lost_at timestamptz;

create index if not exists creators_lost_at_idx on public.creators(lost_at) where lost_at is not null;
create index if not exists brands_lost_at_idx on public.brands(lost_at) where lost_at is not null;
create index if not exists brand_contacts_lost_at_idx on public.brand_contacts(lost_at) where lost_at is not null;
create index if not exists campaigns_lost_at_idx on public.campaigns(lost_at) where lost_at is not null;
