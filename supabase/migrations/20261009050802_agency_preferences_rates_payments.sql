-- Workspace preferences (currency, agency name, signature...), creator rate
-- cards and campaign invoice / payout tracking. Additive and idempotent.

alter table public.profiles add column if not exists preferences jsonb not null default '{}'::jsonb;

alter table public.creators add column if not exists rates jsonb not null default '{}'::jsonb;

alter table public.campaigns add column if not exists payment_status text not null default 'unpaid';
alter table public.campaigns add column if not exists invoice_due date;
alter table public.campaigns add column if not exists paid_at timestamptz;
alter table public.campaigns add column if not exists payout_status text not null default 'pending';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campaigns_payment_status_check') then
    alter table public.campaigns add constraint campaigns_payment_status_check check (payment_status in ('unpaid', 'invoiced', 'paid'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'campaigns_payout_status_check') then
    alter table public.campaigns add constraint campaigns_payout_status_check check (payout_status in ('pending', 'paid'));
  end if;
end $$;
