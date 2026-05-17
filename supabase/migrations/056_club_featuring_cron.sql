-- 056 · Cron diario para expiración de featuring de clubes.
--
-- Esta migration:
--   1. Registra el notification_kind 'club_featuring_expiring_soon'.
--   2. Crea fn_process_club_featuring() SECURITY DEFINER que:
--        a. Marca como 'expired' las club_featuring_subscriptions activas vencidas.
--        b. Normaliza clubs.featured_until = null cuando ya pasó.
--        c. Encola avisos para subs activas que vencen en ≤ 7 días, deduplicando
--           por subscription_id (jobs pending/sent en los últimos 7 días).
--   3. Programa el cron diario a las 09:00 UTC (04:00 ECT), 1 hora después
--      del cron de planes (049 corre a las 08:00 UTC) para evitar apilamiento.
--
-- Idempotente: usa on conflict do nothing / or replace / unschedule antes de
-- reprogramar el cron.
--
-- Depende de:
--   * migration 049 (pg_cron habilitado, patrón fn_process_player_plans).
--   * migration 050 (fn_dispatch_inapp_notifications consume los jobs).
--   * migration 054 (clubs.featured_until).
--   * migration 055 (club_featuring_subscriptions con columnas
--     status, expires_at, club_id, requested_by, updated_at).

-- 1. notification_kind. Lo registramos antes de la función para evitar fallas
--    de FK al insertar jobs. allowed_roles = owner|manager porque los avisos
--    son para quienes administran el club (mp_role tiene ambos, ver 002).
insert into notification_kinds (kind, description, allowed_roles, default_channels, category) values
  ('club_featuring_expiring_soon',
   'Tu featuring de club expira pronto',
   array['owner','manager']::mp_role[],
   array['inapp']::mp_notification_channel[],
   'promotions')
on conflict (kind) do nothing;

-- 2. Función de procesamiento diario.
create or replace function public.fn_process_club_featuring()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _sub record;
  _requester_role mp_role;
begin
  -- (a) Marca suscripciones activas vencidas como 'expired'.
  update public.club_featuring_subscriptions
     set status = 'expired',
         updated_at = now()
   where status = 'active'
     and expires_at is not null
     and expires_at < now();

  -- (b) Normaliza clubs.featured_until cuando ya pasó.
  update public.clubs
     set featured_until = null
   where featured_until is not null
     and featured_until < now();

  -- (c) Encola avisos para subs activas que vencen en ≤ 7 días.
  --     Dedup por subscription_id en jobs pending|sent de los últimos 7 días.
  for _sub in
    select s.id, s.club_id, s.expires_at, s.requested_by,
           c.name as club_name
      from public.club_featuring_subscriptions s
      join public.profiles p on p.id = s.requested_by  -- skip si user borrado
      left join public.clubs c on c.id = s.club_id
     where s.status = 'active'
       and s.expires_at is not null
       and s.expires_at >= now()
       and s.expires_at <= now() + interval '7 days'
  loop
    if not exists (
      select 1
        from public.notification_jobs j
       where j.kind = 'club_featuring_expiring_soon'
         and j.payload ->> 'subscription_id' = _sub.id::text
         and j.status in ('pending', 'sent')
         and j.created_at >= now() - interval '7 days'
    ) then
      -- Elegimos un rol válido según allowed_roles del kind. Preferimos 'owner'
      -- si el requester lo tiene en algún club, sino 'manager'. Para no
      -- complicar, fijamos 'owner' por defecto (es el caso común para quien
      -- contrata featuring de su propio club).
      _requester_role := 'owner'::mp_role;

      insert into public.notification_jobs (user_id, role, kind, channel, payload, status)
      values (
        _sub.requested_by,
        _requester_role,
        'club_featuring_expiring_soon',
        'inapp'::mp_notification_channel,
        jsonb_build_object(
          'subscription_id', _sub.id,
          'club_id',         _sub.club_id,
          'club_name',       _sub.club_name,
          'expires_at',      _sub.expires_at,
          'days_remaining',  extract(day from (_sub.expires_at - now()))::int
        ),
        'pending'
      );
    end if;
  end loop;
end;
$$;

revoke all on function public.fn_process_club_featuring() from public;
grant execute on function public.fn_process_club_featuring() to service_role;

-- 3. Cron diario.
--    09:00 UTC = 04:00 America/Guayaquil (UTC-5). Una hora después del cron
--    de planes (049 → 08:00 UTC) para no apilar carga. Distinto del
--    dispatcher inapp (050 → cada 5 minutos).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'process-club-featuring-daily') then
    perform cron.unschedule('process-club-featuring-daily');
  end if;

  perform cron.schedule(
    'process-club-featuring-daily',
    '0 9 * * *',
    $cron$ select public.fn_process_club_featuring() $cron$
  );
end $$;
