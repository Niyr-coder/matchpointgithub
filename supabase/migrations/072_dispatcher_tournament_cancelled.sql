-- Agrega rama 'tournament_cancelled' al dispatcher inapp. Mismo cuerpo que
-- 050_inapp_notifications.sql, añadiendo el nuevo elsif. Idempotente
-- (create or replace).
create or replace function public.fn_dispatch_inapp_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _job record;
  _kind text;
  _payload jsonb;
  _title text;
  _body text;
  _link text;
  _notif_id uuid;
  _existing_notif uuid;
  _processed int := 0;
  _err text;
begin
  for _job in
    select id, user_id, role, kind, payload
      from public.notification_jobs
     where status = 'pending'
       and channel = 'inapp'
     order by scheduled_for asc
     limit 500
     for update skip locked
  loop
    begin
      _kind := _job.kind;
      _payload := coalesce(_job.payload, '{}'::jsonb);
      _title := nullif(_payload->>'title', '');
      _body := nullif(_payload->>'body', '');
      _link := null;
      _notif_id := null;

      if _kind = 'event_rescheduled' then
        if _title is null then _title := 'Tu evento cambió de fecha'; end if;
        if _body is null then
          _body := coalesce(_payload->>'event_name', 'Un evento')
                || ' fue reprogramado.';
        end if;
        if _payload ? 'event_id' then
          _link := '/eventos/' || (_payload->>'event_id');
        end if;

      elsif _kind = 'tournament_rescheduled' then
        if _title is null then _title := 'Tu torneo cambió de fecha'; end if;
        if _body is null then
          _body := coalesce(_payload->>'tournament_name', _payload->>'event_name', 'Un torneo')
                || ' fue reprogramado.';
        end if;
        if _payload ? 'tournament_id' then
          _link := '/eventos/' || (_payload->>'tournament_id');
        elsif _payload ? 'event_id' then
          _link := '/eventos/' || (_payload->>'event_id');
        end if;

      elsif _kind = 'tournament_cancelled' then
        if _title is null then _title := 'Tu torneo fue cancelado'; end if;
        if _body is null then
          _body := coalesce(_payload->>'tournament_name', 'Un torneo')
                || ' fue cancelado por el organizador. Si pagaste cuota, te será devuelta.';
        end if;
        if _payload ? 'tournament_id' then
          _link := '/eventos/' || (_payload->>'tournament_id');
        end if;

      elsif _kind = 'plan_expiring_soon' then
        if _title is null then _title := 'Tu plan Premium expira pronto'; end if;
        if _body is null then
          if _payload ? 'days_remaining' then
            _body := 'Vence en ' || (_payload->>'days_remaining') || ' días.';
          else
            _body := 'Tu plan Premium está por vencer.';
          end if;
        end if;
        _link := '/dashboard/user/mi-plan';

      elsif _kind = 'reservation_created' then
        if _title is null then _title := 'Reserva confirmada'; end if;
        if _body is null then
          _body := trim(both ' · ' from
            concat_ws(' · ',
              _payload->>'club_name',
              _payload->>'court_name',
              _payload->>'starts_at'
            )
          );
          if _body = '' then _body := 'Tu reserva fue confirmada.'; end if;
        end if;
        _link := '/dashboard/user/reservas';

      else
        if _title is null then _title := _kind; end if;
        if _body is null then _body := _payload::text; end if;
        _link := null;
      end if;

      if _payload ? 'notification_id' then
        begin
          _existing_notif := (_payload->>'notification_id')::uuid;
        exception when others then
          _existing_notif := null;
        end;
      end if;

      if _existing_notif is not null then
        update public.notifications
           set link = coalesce(link, _link),
               delivered_at = coalesce(delivered_at, now())
         where id = _existing_notif;
        if found then
          _notif_id := _existing_notif;
        end if;
      end if;

      if _notif_id is null then
        insert into public.notifications
          (recipient_user_id, recipient_role, kind, title, body, payload, link, delivered_at)
        values
          (_job.user_id, _job.role, _kind, _title, _body, _payload, _link, now())
        returning id into _notif_id;
      end if;

      update public.notification_jobs
         set status = 'sent',
             sent_at = now(),
             attempts = attempts + 1
       where id = _job.id;

      _processed := _processed + 1;

    exception when others then
      _err := SQLERRM;
      update public.notification_jobs
         set status = 'failed',
             attempts = attempts + 1,
             last_error = _err
       where id = _job.id;
    end;
  end loop;

  return _processed;
end;
$$;
