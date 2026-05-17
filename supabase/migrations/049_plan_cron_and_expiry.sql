-- 049 · pg_cron + procesamiento diario de planes de jugador.
--
-- Esta migration:
--   1. Habilita la extensión pg_cron.
--   2. Crea fn_process_player_plans() SECURITY DEFINER que:
--        a. Marca como 'expired' las suscripciones 'active' cuyo expires_at pasó.
--        b. Normaliza profiles.plan_tier='free' / plan_expires_at=null para los
--           usuarios cuyo plan premium ya venció.
--        c. Encola notificaciones 'plan_expiring_soon' para suscripciones activas
--           que vencen en los próximos 7 días, deduplicando por subscription_id.
--   3. Registra el notification_kind 'plan_expiring_soon' (category 'plans').
--   4. Programa el cron diario a las 08:00 UTC.
--
-- Idempotente: usa if not exists / or replace / on conflict do nothing y
-- desprograma el cron antes de reprogramarlo.

-- 1. pg_cron
create extension if not exists pg_cron;

-- 3. notification_kind (lo registramos antes de la función para que el insert
--    en notification_jobs no falle por la FK si la función se ejecuta luego).
insert into notification_kinds (kind, description, allowed_roles, default_channels, category) values
  ('plan_expiring_soon',
   'Tu plan premium está por vencer',
   array['user']::mp_role[],
   array['inapp']::mp_notification_channel[],
   'plans')
on conflict (kind) do nothing;

-- 2. Función de procesamiento diario.
create or replace function public.fn_process_player_plans()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _sub record;
begin
  -- (a) Marca suscripciones activas vencidas como 'expired'.
  update public.player_subscriptions
     set status = 'expired',
         updated_at = now()
   where status = 'active'
     and expires_at is not null
     and expires_at < now();

  -- (b) Normaliza el plan del perfil cuando el premium ya venció.
  update public.profiles
     set plan_tier = 'free',
         plan_expires_at = null
   where plan_tier = 'premium'
     and plan_expires_at is not null
     and plan_expires_at < now();

  -- (c) Encola avisos para suscripciones activas que vencen en ≤ 7 días.
  --     Deduplicación: solo insertamos si no existe ya un job 'plan_expiring_soon'
  --     en estado pending o sent para esa subscription en los últimos 7 días.
  for _sub in
    select s.id, s.user_id, s.tier, s.expires_at
      from public.player_subscriptions s
     where s.status = 'active'
       and s.expires_at is not null
       and s.expires_at >= now()
       and s.expires_at <= now() + interval '7 days'
  loop
    if not exists (
      select 1
        from public.notification_jobs j
       where j.kind = 'plan_expiring_soon'
         and j.payload ->> 'subscription_id' = _sub.id::text
         and j.status in ('pending', 'sent')
         and j.created_at >= now() - interval '7 days'
    ) then
      insert into public.notification_jobs (user_id, role, kind, channel, payload, status)
      values (
        _sub.user_id,
        'user'::mp_role,
        'plan_expiring_soon',
        'inapp'::mp_notification_channel,
        jsonb_build_object(
          'subscription_id', _sub.id,
          'tier', _sub.tier,
          'expires_at', _sub.expires_at,
          'days_remaining', extract(day from (_sub.expires_at - now()))::int
        ),
        'pending'
      );
    end if;
  end loop;
end;
$$;

-- 4. Programación del cron diario.
--    08:00 UTC = 03:00 America/Guayaquil (UTC-5): horario de baja carga
--    para Ecuador y suficiente margen antes de la jornada de uso.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'process-player-plans-daily') then
    perform cron.unschedule('process-player-plans-daily');
  end if;

  perform cron.schedule(
    'process-player-plans-daily',
    '0 8 * * *',
    $cron$ select public.fn_process_player_plans() $cron$
  );
end $$;
