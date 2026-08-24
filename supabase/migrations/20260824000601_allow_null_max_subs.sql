-- Allow max subscribers to be optional (NULL = no upper limit)
alter table public.creator_discovery_settings alter column subscriber_max drop not null;
alter table public.creator_discovery_settings alter column subscriber_max set default null;
-- Update existing rows that had the old default 1M to NULL (no limit) per user request
update public.creator_discovery_settings set subscriber_max = null where subscriber_max = 1000000;
