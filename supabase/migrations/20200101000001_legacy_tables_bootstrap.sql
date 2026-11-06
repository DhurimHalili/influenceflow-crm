-- Legacy tables that exist in production but were created before migrations
-- tracked them. Generated from the production catalog; idempotent, so it is a
-- no-op on production and lets a fresh project replay every later migration.

do $$ begin create type public.job_status as enum ('queued', 'running', 'done', 'failed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.lead_status as enum ('new', 'contacted', 'replied', 'skipped', 'archived'); exception when duplicate_object then null; end $$;
do $$ begin create type public.opportunity_type as enum ('offline', 'social', 'has_website'); exception when duplicate_object then null; end $$;

create table if not exists public.app_users (
  id uuid default gen_random_uuid() not null,
  username text not null,
  display_name text not null,
  password_hash text not null,
  password_salt text not null,
  created_at timestamp with time zone default now() not null
);
do $$ begin
  alter table public.app_users add constraint app_users_username_key UNIQUE (username);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.app_users add constraint app_users_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
alter table public.app_users enable row level security;

create table if not exists public.city_coverage (
  id uuid default gen_random_uuid() not null,
  country text not null,
  city text not null,
  keyword text not null,
  last_run_at timestamp with time zone default now() not null,
  total_unique_leads integer default 0 not null,
  exhausted boolean default false not null,
  user_id uuid
);
do $$ begin
  alter table public.city_coverage add constraint city_coverage_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.city_coverage add constraint city_coverage_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
create unique index if not exists city_coverage_user_uidx ON public.city_coverage USING btree (user_id, country, city, keyword);
alter table public.city_coverage enable row level security;

create table if not exists public.email_templates (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  template_key text not null,
  subject text not null,
  body_text text not null,
  body_html text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
do $$ begin
  alter table public.email_templates add constraint email_templates_user_id_template_key_key UNIQUE (user_id, template_key);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.email_templates add constraint email_templates_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.email_templates add constraint email_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.email_templates add constraint email_templates_template_key_check CHECK ((template_key = ANY (ARRAY['new'::text, 'reach_back_0'::text, 'reach_back_1'::text, 'reach_back_2'::text])));
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
alter table public.email_templates enable row level security;

create table if not exists public.external_links (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  brand_id uuid not null,
  creator_name text not null,
  platform text,
  channel_link text,
  video_link text,
  relationship_type text default 'external'::text not null,
  signed_creator_id uuid,
  notes text default ''::text,
  created_at timestamp with time zone default now() not null,
  creator_id uuid,
  source_video_url text,
  discovered_at timestamp with time zone default now(),
  domain text
);
do $$ begin
  alter table public.external_links add constraint external_links_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.external_links add constraint external_links_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.external_links add constraint external_links_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.external_links add constraint external_links_signed_creator_id_fkey FOREIGN KEY (signed_creator_id) REFERENCES creators(id) ON DELETE SET NULL;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.external_links add constraint external_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.external_links add constraint external_links_relationship_type_check CHECK ((relationship_type = ANY (ARRAY['external'::text, 'past_sponsor'::text, 'existing_partner'::text, 'agency'::text])));
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
alter table public.external_links enable row level security;

create table if not exists public.gmail_tokens (
  user_id uuid not null,
  access_token text,
  refresh_token text not null,
  expiry timestamp with time zone,
  email text,
  updated_at timestamp with time zone default now() not null,
  scopes text default ''::text not null,
  history_id text,
  last_sync_at timestamp with time zone,
  sync_error text default ''::text not null,
  backfilled text[] default '{}'::text[] not null,
  connected_at timestamp with time zone,
  id uuid default gen_random_uuid() not null,
  send_day date,
  send_count integer default 0 not null,
  leads_scanned_at timestamp with time zone,
  coverage jsonb default '{}'::jsonb not null,
  lead_queue text[] default '{}'::text[] not null,
  read_at timestamp with time zone,
  track_lock_until timestamp with time zone,
  read_lock_until timestamp with time zone,
  watch_expires_at timestamp with time zone
);
do $$ begin
  alter table public.gmail_tokens add constraint gmail_tokens_user_email_key UNIQUE (user_id, email);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.gmail_tokens add constraint gmail_tokens_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.gmail_tokens add constraint gmail_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
create index if not exists gmail_tokens_user ON public.gmail_tokens USING btree (user_id);
alter table public.gmail_tokens enable row level security;

create table if not exists public.leads (
  id uuid default gen_random_uuid() not null,
  place_id text not null,
  business_name text not null,
  contact_name text,
  phone text,
  email text,
  maps_url text,
  website text,
  opportunity_type opportunity_type default 'offline'::opportunity_type not null,
  country text not null,
  city text not null,
  keyword_found_via text,
  status lead_status default 'new'::lead_status not null,
  notes text default ''::text not null,
  times_seen integer default 1 not null,
  first_seen_at timestamp with time zone default now() not null,
  last_seen_at timestamp with time zone default now() not null,
  website_verified_at timestamp with time zone,
  has_real_website boolean default false not null,
  outreach_message text,
  message_generated_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  user_id uuid,
  whatsapp_status text,
  rating double precision,
  review_count integer
);
do $$ begin
  alter table public.leads add constraint leads_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.leads add constraint leads_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
create index if not exists leads_country_city_idx ON public.leads USING btree (country, city);
create index if not exists leads_last_seen_idx ON public.leads USING btree (last_seen_at DESC);
create index if not exists leads_status_idx ON public.leads USING btree (status);
create index if not exists leads_user_id_idx ON public.leads USING btree (user_id);
create unique index if not exists leads_user_place_uidx ON public.leads USING btree (user_id, place_id);
alter table public.leads enable row level security;

create table if not exists public.outreach_events (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  target_type text not null,
  target_id uuid not null,
  email text not null,
  mode text not null,
  subject text,
  message_id text,
  sent_at timestamp with time zone default now() not null
);
do $$ begin
  alter table public.outreach_events add constraint outreach_events_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.outreach_events add constraint outreach_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.outreach_events add constraint outreach_events_mode_check CHECK ((mode = ANY (ARRAY['new'::text, 'reach_back'::text])));
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.outreach_events add constraint outreach_events_target_type_check CHECK ((target_type = ANY (ARRAY['creator'::text, 'brand_contact'::text])));
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
create index if not exists outreach_user_idx ON public.outreach_events USING btree (user_id, sent_at DESC);
alter table public.outreach_events enable row level security;

create table if not exists public.scrape_jobs (
  id uuid default gen_random_uuid() not null,
  country text not null,
  city text not null,
  keyword text not null,
  category text,
  status job_status default 'queued'::job_status not null,
  pages_fetched integer default 0 not null,
  places_scanned integer default 0 not null,
  leads_added integer default 0 not null,
  leads_skipped_dup integer default 0 not null,
  leads_excluded_website integer default 0 not null,
  next_page_token text,
  query_variant_index integer default 0 not null,
  max_pages integer default 30 not null,
  empty_new_streak integer default 0 not null,
  error text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  user_id uuid
);
do $$ begin
  alter table public.scrape_jobs add constraint scrape_jobs_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.scrape_jobs add constraint scrape_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
create index if not exists scrape_jobs_status_idx ON public.scrape_jobs USING btree (status, created_at DESC);
create index if not exists scrape_jobs_user_id_idx ON public.scrape_jobs USING btree (user_id);
create index if not exists scrape_jobs_user_status_idx ON public.scrape_jobs USING btree (user_id, status, created_at DESC);
alter table public.scrape_jobs enable row level security;

create table if not exists public.send_jobs (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  mode text not null,
  status text default 'pending'::text not null,
  total integer default 0 not null,
  sent integer default 0 not null,
  failed integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  started_at timestamp with time zone,
  finished_at timestamp with time zone
);
do $$ begin
  alter table public.send_jobs add constraint send_jobs_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.send_jobs add constraint send_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.send_jobs add constraint send_jobs_mode_check CHECK ((mode = ANY (ARRAY['new'::text, 'reach_back'::text, 'mixed'::text])));
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.send_jobs add constraint send_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'cancelled'::text, 'failed'::text])));
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
create index if not exists send_jobs_user_idx ON public.send_jobs USING btree (user_id, created_at DESC);
alter table public.send_jobs enable row level security;

create table if not exists public.send_job_items (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  job_id uuid not null,
  target_type text not null,
  target_id uuid not null,
  email text not null,
  first_name text,
  brand_name text,
  send_mode text not null,
  subject text not null,
  body_text text not null,
  body_html text,
  customized boolean default false not null,
  status text default 'queued'::text not null,
  error text,
  message_id text,
  sent_at timestamp with time zone,
  sort_order integer default 0 not null
);
do $$ begin
  alter table public.send_job_items add constraint send_job_items_pkey PRIMARY KEY (id);
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.send_job_items add constraint send_job_items_job_id_fkey FOREIGN KEY (job_id) REFERENCES send_jobs(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.send_job_items add constraint send_job_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.send_job_items add constraint send_job_items_send_mode_check CHECK ((send_mode = ANY (ARRAY['new'::text, 'reach_back'::text])));
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.send_job_items add constraint send_job_items_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'sent'::text, 'failed'::text, 'skipped'::text])));
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
do $$ begin
  alter table public.send_job_items add constraint send_job_items_target_type_check CHECK ((target_type = ANY (ARRAY['creator'::text, 'brand_contact'::text])));
exception when duplicate_object or duplicate_table or invalid_table_definition then null;
end $$;
alter table public.send_job_items enable row level security;

-- Owner-only policies these legacy tables carry in production.
drop policy if exists "email_templates_all" on public.email_templates;
create policy "email_templates_all" on public.email_templates for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "external_links_all" on public.external_links;
create policy "external_links_all" on public.external_links for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "outreach_events_all" on public.outreach_events;
create policy "outreach_events_all" on public.outreach_events for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "send_jobs_all" on public.send_jobs;
create policy "send_jobs_all" on public.send_jobs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "send_job_items_all" on public.send_job_items;
create policy "send_job_items_all" on public.send_job_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());

