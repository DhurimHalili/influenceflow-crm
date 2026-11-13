-- Match v3: every video of the last year, and what creators SAY in them.
--
--   creator_content.backfill   where the full-year read of a creator's uploads
--                              stands ({token, done, at}) — the first read no
--                              longer stops at 150 videos; it carries on, a few
--                              pages a run, until it reaches a year back.
--   creator_videos.transcript_* captions read by the free browser helper (from
--                              the member's own connection — YouTube blocks
--                              servers): status, language, manual/auto, when,
--                              by whom, and ONLY the lines that matter (the
--                              sponsor read, "X sent me this", codes) — never
--                              the whole transcript.
--   creator_brands.video_ids   every video a creator × brand deal was seen in
--                              (evidence keeps the best 6 quotes; the app loads
--                              the rest from creator_videos on demand).
--
-- Additive and idempotent. Server-owned columns: the app only reads them (RLS
-- select-own + the restrictive approved_members_only policy are already on
-- these tables); writes go through the brand-match function.

alter table public.creator_content add column if not exists backfill jsonb not null default '{}'::jsonb;

alter table public.creator_videos add column if not exists transcript_status text not null default '';
alter table public.creator_videos add column if not exists transcript_lang text not null default '';
alter table public.creator_videos add column if not exists transcript_kind text not null default '';
alter table public.creator_videos add column if not exists transcript_at timestamptz;
alter table public.creator_videos add column if not exists transcript_hits jsonb not null default '[]'::jsonb;
alter table public.creator_videos add column if not exists transcript_tries smallint not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'creator_videos_transcript_status_check') then
    alter table public.creator_videos add constraint creator_videos_transcript_status_check
      check (transcript_status in ('', 'ok', 'none', 'error'));
  end if;
end $$;

-- The helper's queue: videos of the last ~13 months still without a transcript, newest first.
create index if not exists creator_videos_transcript_idx on public.creator_videos (user_id, paid desc, published_at desc) where transcript_status = '';

alter table public.creator_brands add column if not exists video_ids text[] not null default '{}';
