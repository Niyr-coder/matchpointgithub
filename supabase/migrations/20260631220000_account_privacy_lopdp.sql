-- LOPDP: cierre programado de cuenta + índice para cron de borrado.

alter table public.profiles
  add column if not exists scheduled_deletion_at timestamptz,
  add column if not exists deletion_reason text;

comment on column public.profiles.scheduled_deletion_at is
  'Fecha en la que el cron debe ejecutar borrado definitivo (período de gracia LOPDP).';
comment on column public.profiles.deletion_reason is
  'Motivo opcional declarado por el titular al solicitar cierre de cuenta.';

create index if not exists idx_profiles_scheduled_deletion
  on public.profiles (scheduled_deletion_at)
  where scheduled_deletion_at is not null;
