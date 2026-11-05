-- Which email thread a conversation continues in (additive, idempotent).
--
-- After 4 follow-ups in one thread an agency starts a fresh thread ("new
-- reach"). Both threads stay tracked; follow-up reminders follow one of them:
--   primary_thread     — the Gmail thread you chose to continue in ('' = automatic:
--                        the thread with the latest activity)
--   primary_thread_at  — when you chose it; a thread started after that wins again
--   new_thread_gap     — business days to wait after the last allowed follow-up
--                        before the "start a new thread" reminder (null = your
--                        follow-up rules' default)

alter table public.creators add column if not exists primary_thread text not null default '';
alter table public.creators add column if not exists primary_thread_at timestamptz;
alter table public.creators add column if not exists new_thread_gap smallint;
alter table public.brands add column if not exists primary_thread text not null default '';
alter table public.brands add column if not exists primary_thread_at timestamptz;
alter table public.brands add column if not exists new_thread_gap smallint;
alter table public.creators drop constraint if exists creators_new_thread_gap_check;
alter table public.creators add constraint creators_new_thread_gap_check check (new_thread_gap is null or new_thread_gap between 0 and 30);
alter table public.brands drop constraint if exists brands_new_thread_gap_check;
alter table public.brands add constraint brands_new_thread_gap_check check (new_thread_gap is null or new_thread_gap between 0 and 30);
