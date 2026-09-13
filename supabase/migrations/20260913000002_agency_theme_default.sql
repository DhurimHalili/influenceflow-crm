-- New users should start on the Agency theme, and profiles.theme must accept
-- every theme the app offers (the old check only allowed 'dark' and 'light',
-- which forced 'dark' as the only viable default and rejected 'agency').

alter table public.profiles
  alter column theme set default 'agency';

alter table public.profiles
  drop constraint if exists profiles_theme_check;

alter table public.profiles
  add constraint profiles_theme_check
  check (theme = ANY (ARRAY[
    'agency'::text, 'light'::text, 'dark'::text, 'honey'::text, 'ocean'::text
  ]));

-- sanitize any rows carrying a value outside the app's theme list
update public.profiles
set theme = 'agency'
where theme not in ('agency', 'light', 'dark', 'honey', 'ocean');
