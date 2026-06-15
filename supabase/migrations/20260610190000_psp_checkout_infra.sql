-- Infra PSP piloto: idempotencia de webhooks + flag checkout (off por defecto).

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe', 'mercadopago')),
  provider_event_id text not null,
  event_type text not null,
  transaction_id uuid references public.transactions (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  constraint payment_webhook_events_provider_event_unique unique (provider, provider_event_id)
);

create index if not exists payment_webhook_events_transaction_id_idx
  on public.payment_webhook_events (transaction_id);

create index if not exists payment_webhook_events_received_at_idx
  on public.payment_webhook_events (received_at desc);

alter table public.payment_webhook_events enable row level security;
-- Sin policies: solo service role (webhooks + admin tooling).

comment on table public.payment_webhook_events is
  'Dedup de eventos PSP. provider + provider_event_id es idempotency key.';

insert into public.feature_flags (key, description, enabled_default, rollout_pct, env, impact, label)
values (
  'psp_checkout_enabled',
  'Encendido = checkout con tarjeta (Stripe/Mercado Pago) para kinds piloto (plan, tournament, event, club_featuring). Off = solo comprobante manual.',
  false,
  0,
  'prod',
  'high',
  'Checkout PSP (piloto)'
)
on conflict (key) do update set
  description = excluded.description,
  label = excluded.label,
  impact = excluded.impact;
