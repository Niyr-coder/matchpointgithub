-- Worker de despacho de campañas programadas.
-- Canónico en Supabase (pg_cron cada 5 min). El cron HTTP /api/cron/dispatch-broadcasts
-- queda como fallback manual; no debe estar en vercel.json (evita doble envío en Hobby).

create or replace function public.fn_dispatch_scheduled_broadcasts()
returns table(dispatched int, recipients int)
language plpgsql
security definer
set search_path = public
as $$
declare
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
    update broadcasts set status = 'sending' where id = _bc.id;

    _tf := coalesce(_bc.target_filter, '{}'::jsonb);
    _targets := '{}';
    _sent := 0;

    if _bc.scope = 'platform' then
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
      select array_agg(q.organizer_id) into _targets from (
        select distinct r.organizer_id
        from reservations r
        where r.club_id = _bc.club_id
          and r.organizer_id is not null
        limit _batch_limit
      ) q;

    elsif _bc.scope = 'partner' then
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
  'Despacha campañas scheduled con scheduled_for<=now() vía fn_enqueue_notification. Agendada con pg_cron.';

create index if not exists idx_broadcasts_scheduled_due
  on public.broadcasts (scheduled_for asc)
  where status = 'scheduled' and scheduled_for is not null;

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
