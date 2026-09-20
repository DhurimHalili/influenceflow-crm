-- 20260920000002_brand_priority.sql
-- Priority flags + action due dates for brands (mirrors creators).
-- Additive only.

alter table public.brands add column if not exists priority text not null default 'none';
alter table public.brands add column if not exists next_action_date date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'brands_priority_check') then
    alter table public.brands add constraint brands_priority_check check (priority in ('none', 'soon', 'urgent'));
  end if;
end $$;

create index if not exists brands_priority_idx on public.brands(user_id, priority) where archived_at is null;
