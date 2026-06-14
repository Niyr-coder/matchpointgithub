-- 20260614120000 · Worker de despacho de campañas programadas (gap A3 de MAT-70).
--
-- Hasta ahora `createBroadcast` guardaba la campaña con status='scheduled' +
-- scheduled_for, pero NADA la despachaba al llegar la hora (la UI lo admitía:
-- "falta activar el worker de despacho automático"). Esto cierra ese gap con
-- el mismo patrón que el resto de crons del repo (fn_generate_payouts,
-- fn_dispatch_inapp_notifications): una función PL/pgSQL agendada con pg_cron.
--
-- Clave de bajo riesgo: la función NO reimplementa la lógica de notificación.
-- Llama a public.fn_enqueue_notification(...) por cada target — exactamente lo
-- que hace notify() (TS) vía RPC — así la inserción en notifications +
-- notification_jobs es idéntica al despacho manual (`dispatchBroadcast`). Lo
-- único que se replica es la resolución de audiencia por scope, que son
-- filtros directos sobre columnas reales (espejo de resolvePlatformTargetIds).
--
-- Ver docs/guides/02-notifications.md (kind 'broadcast', mig 176) y
-- docs/product/08-monetization-blueprint.md.

create or replace function public.fn_dispatch_scheduled_broadcasts()
returns table(dispatched int, recipients int)
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Cap de seguridad por campaña, espejo de BATCH_LIMIT del dispatch manual.
  _batch_limit int := 5000;
  _bc record;
  _targets uuid[];
  _uid uuid;
  _notif_id uuid;
  _sent int;
  _tf jsonb;
begin
  dispatched := 0;
  recipients := 0;

  for _bc in
    select id, scope, club_id, partner_id, title, body, target_filter
    from broadcasts
    where status = 'scheduled'
      and scheduled_for is not null
      and scheduled_for <= now()
    order by scheduled_for asc
    limit 50
    for update skip locked
  loop
    -- Reclamar la campaña antes del fan-out para que corridas solapadas del
    -- cron no la despachen dos veces.
    update broadcasts set status = 'sending' where id = _bc.id;

    _tf := coalesce(_bc.target_filter, '{}'::jsonb);
    _targets := '{}';
    _sent := 0;

    if _bc.scope = 'platform' then
      -- Espejo de resolvePlatformTargetIds: filtros sobre profiles +
      -- role_assignments. Comparaciones por ::text para no depender de enums.
      select array_agg(q.id) into _targets from (
        select p.id
        from profiles p
        where p.is_system = false
          and (_tf->>'city' is null or p.city ilike (_tf->>'city'))
          and (_tf->>'sport' is null or p.preferred_sport::text = (_tf->>'sport'))
          and (_tf->>'plan' is distinct from 'premium' or p.plan_tier::text = 'premium')
          and (
            _tf->>'role' is distinct from 'owner'
            or p.id in (
              select ra.user_id from role_assignments ra
              where ra.role = 'owner' and ra.revoked_at is null
            )
          )
          and (
            _tf->>'audience' is distinct from 'team_captains'
            or p.id in (
              select t.captain_id from teams t where t.status = 'active'
            )
          )
        limit _batch_limit
      ) q;

    elsif _bc.scope = 'club' then
      -- Clientes del club = organizers de reservations (mismo criterio que TS).
      select array_agg(q.organizer_id) into _targets from (
        select distinct r.organizer_id
        from reservations r
        where r.club_id = _bc.club_id
          and r.organizer_id is not null
        limit _batch_limit
      ) q;

    elsif _bc.scope = 'partner' then
      -- Inscritos en torneos del partner (player_ids de registrations).
      select array_agg(q.pid) into _targets from (
        select distinct pid
        from (
          select unnest(reg.player_ids) as pid
          from registrations reg
          where reg.tournament_id in (
            select tr.id from tournaments tr where tr.partner_id = _bc.partner_id
          )
        ) flat
        where pid is not null
        limit _batch_limit
      ) q;
    end if;

    if _targets is not null then
      foreach _uid in array _targets loop
        -- Errores individuales no rompen el batch (notify() también los traga).
        begin
          _notif_id := public.fn_enqueue_notification(
            _uid,
            'user'::public.mp_role,
            'broadcast',
            _bc.title,
            _bc.body,
            jsonb_build_object('broadcastId', _bc.id)
          );
          insert into broadcast_recipients (broadcast_id, user_id, notification_id)
          values (_bc.id, _uid, _notif_id)
          on conflict (broadcast_id, user_id) do nothing;
          _sent := _sent + 1;
        exception when others then
          null;
        end;
      end loop;
    end if;

    update broadcasts
      set status = 'sent', sent_at = now()
      where id = _bc.id;

    dispatched := dispatched + 1;
    recipients := recipients + _sent;
  end loop;

  return next;
end;
$$;

comment on function public.fn_dispatch_scheduled_broadcasts() is
  'Despacha campañas (broadcasts) con status=scheduled y scheduled_for<=now() reusando fn_enqueue_notification. Agendada con pg_cron cada 5 min. Gap A3 MAT-70.';

-- Agenda cada 5 minutos (misma cadencia que el dispatcher in-app). Guard por si
-- la extensión pg_cron no está disponible (entornos locales sin cron).
do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'dispatch-scheduled-broadcasts') then
      perform cron.unschedule('dispatch-scheduled-broadcasts');
    end if;
    perform cron.schedule(
      'dispatch-scheduled-broadcasts',
      '*/5 * * * *',
      $$select public.fn_dispatch_scheduled_broadcasts();$$
    );
  end if;
exception
  when undefined_function or undefined_table then
    null;
end $do$;
