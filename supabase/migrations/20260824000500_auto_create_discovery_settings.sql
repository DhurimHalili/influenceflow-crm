-- Auto-create Discovery settings for new users so first-time signup is not empty
-- Uses table defaults (520 keywords, 40 negatives, bio, schedule 08:00, etc.) set in earlier migrations
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, display_name, sender_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)), coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  insert into public.email_templates (user_id, template_key, subject, body_text, body_html) values
  (new.id, 'new',
   'Quick question re: {{brand_name}} + YouTube',
   E'Hi {{first_name}},\n\nWe work with a curated roster of tech and AI creators (250K–2M+ subs) who regularly share the tools they trust while navigating workflows, development, and business scaling. {{brand_name}} would fit naturally into their content and help their audiences streamline tasks and optimize efficiency.\n\nWould you be open to reviewing a few creator fits for upcoming campaigns? Or if there''s someone else on the team you''d recommend connecting with, we''d appreciate the direction.\n\nBest,\n{{sender_name}}',
   null),
  (new.id, 'reach_back_0',
   'Re: Quick question re: {{brand_name}} + YouTube',
   E'Hi {{first_name}},\n\nAre you there?\n\nNo stress — just bumping this in case it drowned in your inbox.\n\nWe''ve still got a few creator fits that line up well with {{brand_name}}. Happy to send them over if you want a quick look.\n\nBest,\n{{sender_name}}',
   null),
  (new.id, 'reach_back_1',
   'Re: Quick question re: {{brand_name}} + YouTube',
   E'Hi {{first_name}},\n\nQuick follow-up — I promise this email is shorter than your standup.\n\nOur creators are locking in sponsorship slots for next month, and {{brand_name}} is still a strong match.\n\nWant me to drop 2–3 channel options here?\n\nBest,\n{{sender_name}}',
   null),
  (new.id, 'reach_back_2',
   'Re: Quick question re: {{brand_name}} + YouTube',
   E'Hi {{first_name}},\n\nLast ping from me on this — I''ll take the hint and fade into the background.\n\nIf timing opens up later for {{brand_name}} + YouTube, just reply anytime.\n\nBest,\n{{sender_name}}',
   null);
  -- New: auto-create Discovery settings with defaults (520 desk-setup keywords, 40 negatives, bio, 08:00, 7d cooldown, etc.)
  -- Table defaults already contain the 520 pool, so inserting just user_id is enough.
  insert into public.creator_discovery_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$function$;

-- Backfill for existing users who somehow have no discovery row (should not happen, but safe)
insert into public.creator_discovery_settings (user_id)
select id from auth.users where id not in (select user_id from public.creator_discovery_settings)
on conflict (user_id) do nothing;
