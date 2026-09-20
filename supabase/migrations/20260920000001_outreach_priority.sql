-- 20260920000001_outreach_priority.sql
-- Priority flags + action due dates (creators) and entry kinds (meetings).
-- priority: none | soon | urgent. Urgent floats to the top, red.
-- next_action_date: optional due date for the next action (overdue = red).
-- meetings.kind: meeting | task | reminder, so the calendar tracks more
-- than calls (e.g. "email this influencer"). Additive only.

alter table public.creators add column if not exists priority text not null default 'none';
alter table public.creators add column if not exists next_action_date date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'creators_priority_check') then
    alter table public.creators add constraint creators_priority_check check (priority in ('none', 'soon', 'urgent'));
  end if;
end $$;

alter table public.meetings add column if not exists kind text not null default 'meeting';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'meetings_kind_check') then
    alter table public.meetings add constraint meetings_kind_check check (kind in ('meeting', 'task', 'reminder'));
  end if;
end $$;

create index if not exists creators_priority_idx on public.creators(user_id, priority) where archived_at is null;
