-- P2-B · Notificaciones para cambios de estado de tickets de soporte.
-- Seed idempotente del kind y branch del dispatcher para completar el deep-link.

insert into notification_kinds (kind, description, allowed_roles, default_channels, category) values
  ('ticket_status_changed', 'Cambio de estado en ticket de soporte',
   array['user']::mp_role[], array['inapp']::mp_notification_channel[], 'support')
on conflict (kind) do update set
  description = excluded.description,
  allowed_roles = excluded.allowed_roles,
  default_channels = excluded.default_channels,
  category = excluded.category;

create or replace function public.fn_dispatch_inapp_notifications()
returns integer language plpgsql security definer set search_path = public as $$
declare
  _job record; _kind text; _payload jsonb; _title text; _body text; _link text;
  _notif_id uuid; _existing_notif uuid; _processed int := 0; _err text;
begin
  for _job in
    select id, user_id, role, kind, payload from public.notification_jobs
     where status = 'pending' and channel = 'inapp'
     order by scheduled_for asc limit 500 for update skip locked
  loop
    begin
      _kind := _job.kind; _payload := coalesce(_job.payload, '{}'::jsonb);
      _title := nullif(_payload->>'title', ''); _body := nullif(_payload->>'body', '');
      _link := null; _notif_id := null; _existing_notif := null;

      if not public.fn_notification_preference_enabled(_job.user_id, _job.role, _kind, 'inapp'::public.mp_notification_channel) then
        update public.notification_jobs
           set status = 'skipped',
               attempts = attempts + 1,
               last_error = 'preferencia de notificación desactivada'
         where id = _job.id;
        _processed := _processed + 1;
        continue;
      end if;

      if _kind = 'event_rescheduled' then
        if _title is null then _title := 'Tu evento cambió de fecha'; end if;
        if _body is null then _body := coalesce(_payload->>'event_name', 'Un evento') || ' fue reprogramado.'; end if;
        if _payload ? 'event_id' then _link := '/eventos/' || (_payload->>'event_id'); end if;
      elsif _kind = 'event_registration_cancelled' then
        if _title is null then _title := 'Tu inscripción fue cancelada'; end if;
        if _body is null then _body := 'Tu inscripción a ' || coalesce(_payload->>'event_name', 'el evento') || ' fue cancelada por administración.'; end if;
        if _payload ? 'event_id' then _link := '/dashboard/eventos/' || coalesce(_payload->>'event_slug', _payload->>'event_id'); end if;
      elsif _kind = 'event_registration_transferred' then
        if _title is null then _title := 'Cupo transferido'; end if;
        if _body is null then _body := 'Un cupo de ' || coalesce(_payload->>'event_name', 'un evento') || ' fue transferido por administración.'; end if;
        if _payload ? 'event_id' then _link := '/dashboard/eventos/' || coalesce(_payload->>'event_slug', _payload->>'event_id'); end if;
      elsif _kind = 'event_registration_no_show' then
        if _title is null then _title := 'Marcamos una inasistencia'; end if;
        if _body is null then _body := 'Administración marcó no-show en ' || coalesce(_payload->>'event_name', 'tu evento') || '. Esto puede afectar tu historial de asistencia.'; end if;
        if _payload ? 'event_id' then _link := '/dashboard/eventos/' || coalesce(_payload->>'event_slug', _payload->>'event_id'); end if;
      elsif _kind = 'tournament_rescheduled' then
        if _title is null then _title := 'Tu torneo cambió de fecha'; end if;
        if _body is null then _body := coalesce(_payload->>'tournament_name', _payload->>'event_name', 'Un torneo') || ' fue reprogramado.'; end if;
        if _payload ? 'tournament_id' then _link := '/eventos/' || coalesce(_payload->>'tournament_slug', _payload->>'tournament_id'); end if;
      elsif _kind = 'tournament_cancelled' then
        if _title is null then _title := 'Tu torneo fue cancelado'; end if;
        if _body is null then _body := coalesce(_payload->>'tournament_name', 'Un torneo') || ' fue cancelado por el organizador. Si pagaste cuota, te será devuelta.'; end if;
        if _payload ? 'tournament_id' then _link := '/eventos/' || coalesce(_payload->>'tournament_slug', _payload->>'tournament_id'); end if;
      elsif _kind = 'registration_accepted' then
        if _title is null then _title := 'Inscripción aceptada'; end if;
        if _body is null then _body := 'Tu inscripción a ' || coalesce(_payload->>'tournament_name', 'el torneo') || ' fue aceptada. ¡Nos vemos en cancha!'; end if;
        if _payload ? 'tournament_id' then _link := '/dashboard/eventos/' || coalesce(_payload->>'tournament_slug', _payload->>'tournament_id'); end if;
      elsif _kind = 'registration_rejected' then
        if _title is null then _title := 'Inscripción rechazada'; end if;
        if _body is null then _body := 'Tu inscripción a ' || coalesce(_payload->>'tournament_name', 'el torneo') || ' fue rechazada por el organizador.'; end if;
        if _payload ? 'tournament_id' then _link := '/dashboard/eventos/' || coalesce(_payload->>'tournament_slug', _payload->>'tournament_id'); end if;
      elsif _kind = 'tournament_registration_removed' then
        if _title is null then _title := 'Tu inscripción fue removida'; end if;
        if _body is null then _body := 'Tu inscripción a ' || coalesce(_payload->>'tournament_name', 'el torneo') || ' fue removida por administración.'; end if;
        if _payload ? 'tournament_id' then _link := '/dashboard/eventos/' || coalesce(_payload->>'tournament_slug', _payload->>'tournament_id'); end if;
      elsif _kind = 'payment_proof_rejected' then
        if _title is null then _title := 'Comprobante de pago rechazado'; end if;
        if _body is null then _body := coalesce(_payload->>'rejection_reason', 'El administrador rechazó tu comprobante. Sube uno nuevo desde el detalle del pago.'); end if;
        if _payload ? 'transaction_id' then _link := '/pagos/' || (_payload->>'transaction_id');
        else _link := '/dashboard/user/mi-plan'; end if;
      elsif _kind = 'payment_captured' then
        if _title is null then _title := 'Pago confirmado'; end if;
        if _body is null then _body := 'Confirmamos tu pago en MATCHPOINT.'; end if;
        if _payload ? 'transaction_id' then _link := '/pagos/' || (_payload->>'transaction_id'); end if;
      elsif _kind = 'refund_completed' then
        if _title is null then _title := 'Reembolso registrado'; end if;
        if _body is null then _body := 'Registramos un reembolso para tu pago. Revisa el detalle.'; end if;
        if _payload ? 'transaction_id' then _link := '/pagos/' || (_payload->>'transaction_id'); end if;
      elsif _kind = 'mp_plus_activated' then
        if _title is null then _title := 'MATCHPOINT+ activado'; end if;
        if _body is null then _body := 'Tu plan MATCHPOINT+ está activo.'; end if;
        _link := '/dashboard/user/mi-plan';
      elsif _kind = 'mp_plus_revoked' then
        if _title is null then _title := 'MATCHPOINT+ desactivado'; end if;
        if _body is null then _body := 'Tu plan MATCHPOINT+ fue desactivado por soporte.'; end if;
        _link := '/dashboard/user/mi-plan';
      elsif _kind = 'report_resolved' then
        if _title is null then _title := 'Tu reporte fue revisado'; end if;
        if _body is null then _body := 'El equipo MATCHPOINT revisó tu reporte.'; end if;
        _link := '/dashboard/user/soporte';
      elsif _kind = 'ticket_status_changed' then
        if _title is null then
          if _payload->>'status' = 'resolved' then _title := 'Tu ticket fue resuelto';
          elsif _payload->>'status' = 'closed' then _title := 'Tu ticket fue cerrado';
          elsif _payload->>'status' = 'waiting_user' then _title := 'Necesitamos más información';
          else _title := 'Tu ticket cambió de estado'; end if;
        end if;
        if _body is null then
          _body := 'El estado de tu ticket '
                || coalesce(nullif(_payload->>'code', ''), coalesce(_payload->>'ticketId', _payload->>'ticket_id', ''))
                || ' cambió a '
                || case _payload->>'status'
                    when 'in_progress' then 'en atención'
                    when 'waiting_user' then 'esperando tu respuesta'
                    when 'resolved' then 'resuelto'
                    when 'closed' then 'cerrado'
                    else coalesce(_payload->>'status', 'actualizado')
                   end
                || '.';
        end if;
        _link := '/dashboard/user/soporte';
      elsif _kind = 'broadcast' then
        if _title is null then _title := 'Comunicado de MATCHPOINT'; end if;
        if _body is null then _body := coalesce(_payload->>'body', 'Tienes un nuevo comunicado de MATCHPOINT.'); end if;
        if _payload ? 'link' then _link := _payload->>'link'; end if;
      elsif _kind = 'role_assigned' then
        if _title is null then _title := 'Nuevo rol asignado'; end if;
        if _body is null then _body := 'Tu cuenta recibió un nuevo rol en MATCHPOINT.'; end if;
        if _payload ? 'role' then _link := '/dashboard/' || (_payload->>'role'); end if;
      elsif _kind = 'role_revoked' then
        if _title is null then _title := 'Rol revocado'; end if;
        if _body is null then _body := 'Un rol fue removido de tu cuenta.'; end if;
        _link := '/dashboard/user';
      elsif _kind = 'club_staff_assigned' then
        if _title is null then _title := 'Te agregaron a un club'; end if;
        if _body is null then _body := 'Ya puedes operar el panel del club en MATCHPOINT.'; end if;
        if _payload ? 'role' then _link := '/dashboard/' || (_payload->>'role');
        else _link := '/dashboard/user'; end if;
      elsif _kind = 'club_staff_removed' then
        if _title is null then _title := 'Ya no tienes acceso al club'; end if;
        if _body is null then _body := 'Tu rol de club fue removido.'; end if;
        _link := '/dashboard/user';
      elsif _kind = 'welcome_owner' then
        if _title is null then _title := '¡Bienvenido al portal del club!'; end if;
        if _body is null then _body := 'Tu portal ya está listo para configurar tu club.'; end if;
        _link := '/dashboard/owner';
      elsif _kind = 'plan_expiring_soon' then
        if _title is null then _title := 'Tu plan MATCHPOINT+ expira pronto'; end if;
        if _body is null then
          if _payload ? 'days_remaining' then _body := 'Vence en ' || (_payload->>'days_remaining') || ' días.';
          else _body := 'Tu plan MATCHPOINT+ está por vencer.'; end if;
        end if;
        _link := '/dashboard/user/mi-plan';
      elsif _kind = 'reservation_created' then
        if _title is null then _title := 'Reserva confirmada'; end if;
        if _body is null then
          _body := trim(both ' · ' from concat_ws(' · ', _payload->>'club_name', _payload->>'court_name', _payload->>'starts_at'));
          if _body = '' then _body := 'Tu reserva fue confirmada.'; end if;
        end if;
        _link := '/dashboard/user/reservas';
      elsif _kind = 'match_seek_applied' then
        if _title is null then _title := 'Nueva postulación'; end if;
        if _body is null then _body := coalesce(_payload->>'applicant_name', 'Un jugador') || ' se postuló a tu "Busco partido". Revisa y acepta para jugar.'; end if;
        _link := '/dashboard/user/busco-partido';
        if _payload ? 'seek_id' then _link := _link || '?focus=' || (_payload->>'seek_id'); end if;
      elsif _kind = 'match_seek_accepted' then
        if _title is null then _title := 'Te aceptaron el partido'; end if;
        if _body is null then _body := coalesce(_payload->>'author_name', 'El autor') || ' aceptó tu postulación. Coordinen por el chat del partido.'; end if;
        if _payload ? 'conversation_id' then _link := '/dashboard/user/chat?conv=' || (_payload->>'conversation_id');
        else _link := '/dashboard/user/busco-partido'; end if;
      elsif _kind = 'match_cancelled' then
        if _title is null then _title := 'Tu partido fue cancelado'; end if;
        if _body is null then _body := coalesce(_payload->>'canceller_name', 'El otro jugador') || ' canceló el partido' || coalesce(' · ' || nullif(_payload->>'reason', ''), '') || '.'; end if;
        if _payload ? 'conversation_id' then _link := '/dashboard/user/chat?conv=' || (_payload->>'conversation_id'); end if;
      elsif _kind = 'match_rescheduled' then
        if _title is null then _title := 'Tu partido cambió de hora'; end if;
        if _body is null then _body := coalesce(_payload->>'rescheduler_name', 'El otro jugador') || ' propuso una nueva fecha para el partido. Revisa el chat.'; end if;
        if _payload ? 'conversation_id' then _link := '/dashboard/user/chat?conv=' || (_payload->>'conversation_id'); end if;
      elsif _kind = 'match_no_show_reported' then
        if _title is null then _title := 'Te reportaron una inasistencia'; end if;
        if _body is null then _body := coalesce(_payload->>'reporter_name', 'Un jugador') || ' marcó que no asististe a un partido. Esto afecta tu fiabilidad.'; end if;
        if _payload ? 'conversation_id' then _link := '/dashboard/user/chat?conv=' || (_payload->>'conversation_id'); end if;
      elsif _kind = 'team_member_kicked' then
        if _title is null then _title := 'Saliste de un equipo'; end if;
        if _body is null then
          _body := 'Fuiste removido de ' || coalesce(_payload->>'team_name', 'tu equipo')
                || coalesce('. Motivo: ' || nullif(_payload->>'reason_label',''), '') || '.';
        end if;
        _link := '/dashboard/user/team';
      elsif _kind = 'team_member_joined' then
        if _title is null then _title := 'Nuevo miembro en tu team'; end if;
        if _body is null then
          _body := coalesce(_payload->>'member_name', 'Un jugador') || ' se unió a '
                || coalesce(_payload->>'team_name', 'tu team') || '.';
        end if;
        _link := '/dashboard/user/team';
      elsif _kind = 'team_achievement_awarded' then
        if _title is null then _title := 'Tu team ganó un logro'; end if;
        if _body is null then
          _body := coalesce(_payload->>'achievement_title', 'Nuevo logro')
                || coalesce(' en ' || nullif(_payload->>'team_name',''), '') || '.';
        end if;
        _link := '/dashboard/user/team';
      elsif _kind = 'team_reported' then
        if _title is null then _title := 'Nuevo reporte de team'; end if;
        if _body is null then
          _body := 'Team "' || coalesce(_payload->>'team_name', '?') || '" reportado · '
                || coalesce(_payload->>'kind_label', 'razón no especificada') || '.';
        end if;
        _link := '/dashboard/admin/admin-user-teams';
      elsif _kind = 'team_report_resolved' then
        if _title is null then _title := 'Tu reporte fue resuelto'; end if;
        if _body is null then
          _body := 'El equipo MATCHPOINT revisó tu reporte de "' || coalesce(_payload->>'team_name', 'un team') || '"'
                || coalesce(': ' || nullif(_payload->>'resolution_label',''), '') || '.';
        end if;
        _link := '/dashboard/user/team';
      elsif _kind = 'team_suspended' then
        if _title is null then _title := 'Tu team fue suspendido'; end if;
        if _body is null then
          _body := coalesce(_payload->>'team_name', 'Tu team') || ' fue suspendido por moderación'
                || coalesce('. Motivo: ' || nullif(_payload->>'reason',''), '') || '.';
        end if;
        _link := '/dashboard/user/team';
      elsif _kind = 'team_archived' then
        if _title is null then _title := 'Tu team fue archivado'; end if;
        if _body is null then
          _body := coalesce(_payload->>'team_name', 'Tu team') || ' quedó archivado y dejó de aparecer en discovery.';
        end if;
        _link := '/dashboard/user/team';
      elsif _kind = 'team_reactivated' then
        if _title is null then _title := 'Tu team fue reactivado'; end if;
        if _body is null then
          _body := coalesce(_payload->>'team_name', 'Tu team') || ' volvió a estar activo.';
        end if;
        _link := '/dashboard/user/team';
      elsif _kind = 'team_dissolved_by_admin' then
        if _title is null then _title := 'Tu team fue disuelto'; end if;
        if _body is null then
          _body := coalesce(_payload->>'team_name', 'Un team al que perteneces')
                || ' fue disuelto por moderación de MATCHPOINT.';
        end if;
        _link := '/dashboard/user/team';
      elsif _kind = 'team_admin_message' then
        if _title is null then _title := 'Mensaje del equipo MATCHPOINT'; end if;
        if _body is null then _body := coalesce(_payload->>'body', 'Tienes un mensaje del equipo MATCHPOINT.'); end if;
        _link := '/dashboard/user/mensajes';
      elsif _kind = 'quedada_payment_reminder' then
        if _title is null then _title := 'Recordatorio de pago'; end if;
        if _body is null then
          _body := 'El organizador de ' || coalesce(_payload->>'quedada_title', 'una quedada')
                || ' te recuerda completar tu pago'
                || coalesce(' de ' || nullif(_payload->>'amount_label',''), '') || '.';
        end if;
        if _payload ? 'quedada_id' then _link := '/dashboard/user/quedada/' || (_payload->>'quedada_id'); end if;
      elsif _kind = 'quedada_rescheduled' then
        if _title is null then _title := 'Una quedada cambió de fecha'; end if;
        if _body is null then
          _body := coalesce(_payload->>'quedada_title', 'Una quedada')
                || ' fue reprogramada'
                || coalesce(' para el ' || nullif(_payload->>'starts_label',''), '') || '.';
        end if;
        if _payload ? 'quedada_id' then _link := '/dashboard/user/quedada/' || (_payload->>'quedada_id'); end if;
      elsif _kind = 'club_membership_requested' then
        if _title is null then _title := 'Nueva solicitud de membresía'; end if;
        if _body is null then
          _body := coalesce(_payload->>'member_name', 'Un usuario')
                || ' compró la membresía ' || coalesce(_payload->>'tier_name', 'VIP')
                || '. Revisa el pago para activarla.';
        end if;
        _link := '/dashboard/owner/club-membresias';
      elsif _kind = 'club_membership_activated' then
        if _title is null then _title := 'Tu membresía VIP está activa'; end if;
        if _body is null then
          _body := 'Ya eres miembro ' || coalesce(_payload->>'tier_name', 'VIP')
                || coalesce(' de ' || nullif(_payload->>'club_name',''), '')
                || coalesce('. Vence el ' || nullif(_payload->>'expires_label',''), '') || '.';
        end if;
        _link := '/dashboard/user/membresias';
      elsif _kind = 'club_membership_expiring_soon' then
        if _title is null then _title := 'Tu membresía VIP vence pronto'; end if;
        if _body is null then
          _body := 'Tu membresía ' || coalesce(_payload->>'tier_name', 'VIP')
                || coalesce(' de ' || nullif(_payload->>'club_name',''), '')
                || ' vence pronto. Renuévala para no perder tus beneficios.';
        end if;
        _link := '/dashboard/user/membresias';
      else
        if _title is null then _title := _kind; end if;
        if _body is null then _body := _payload::text; end if;
        _link := null;
      end if;

      if _payload ? 'notification_id' then
        begin _existing_notif := (_payload->>'notification_id')::uuid;
        exception when others then _existing_notif := null; end;
      end if;
      if _existing_notif is not null then
        update public.notifications set link = coalesce(link, _link), delivered_at = coalesce(delivered_at, now()) where id = _existing_notif;
        if found then _notif_id := _existing_notif; end if;
      end if;
      if _notif_id is null then
        insert into public.notifications (recipient_user_id, recipient_role, kind, title, body, payload, link, delivered_at)
        values (_job.user_id, _job.role, _kind, _title, _body, _payload, _link, now()) returning id into _notif_id;
      end if;
      update public.notification_jobs set status = 'sent', sent_at = now(), attempts = attempts + 1 where id = _job.id;
      _processed := _processed + 1;
    exception when others then
      _err := SQLERRM;
      update public.notification_jobs set status = 'failed', attempts = attempts + 1, last_error = _err where id = _job.id;
    end;
  end loop;
  return _processed;
end;
$$;
