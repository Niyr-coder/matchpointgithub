-- 149 · Cron diario de membresías de club (mirror de fn_process_player_plans).
--   (a) marca 'expired' las membresías 'active' vencidas.
--   (b) encola 'club_membership_expiring_soon' para las que vencen en ≤7 días
--       (dedup por membership_id en los últimos 7 días).
-- El kind ya fue seedeado en mig 148.

create extension if not exists pg_cron;

create or replace function public.fn_process_club_memberships()
returns void language plpgsql security definer set search_path = public as $$
declare
  _m record;
begin
  -- (a) Vencidas.
  update public.club_memberships
     set status = 'expired', updated_at = now()
   where status = 'active'
     and expires_at is not null
     and expires_at < now();

  -- (b) Avisos de vencimiento ≤7 días.
  for _m in
    select cm.id, cm.user_id, cm.expires_at,
           coalesce(t.name, 'VIP') as tier_name,
           coalesce(c.name, '') as club_name
      from public.club_memberships cm
      left join public.club_membership_tiers t on t.id = cm.tier_id
      left join public.clubs c on c.id = cm.club_id
     where cm.status = 'active'
       and cm.expires_at is not null
       and cm.expires_at >= now()
       and cm.expires_at <= now() + interval '7 days'
  loop
    if not exists (
      select 1 from public.notification_jobs j
       where j.kind = 'club_membership_expiring_soon'
         and j.payload ->> 'membership_id' = _m.id::text
         and j.status in ('pending','sent')
         and j.created_at >= now() - interval '7 days'
    ) then
      insert into public.notification_jobs (user_id, role, kind, channel, payload, status)
      values (
        _m.user_id, 'user'::mp_role, 'club_membership_expiring_soon', 'inapp'::mp_notification_channel,
        jsonb_build_object(
          'membership_id', _m.id,
          'tier_name', _m.tier_name,
          'club_name', _m.club_name,
          'expires_at', _m.expires_at,
          'days_remaining', extract(day from (_m.expires_at - now()))::int
        ),
        'pending'
      );
    end if;
  end loop;
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'process-club-memberships-daily') then
    perform cron.unschedule('process-club-memberships-daily');
  end if;
  perform cron.schedule(
    'process-club-memberships-daily',
    '15 8 * * *',
    $cron$ select public.fn_process_club_memberships() $cron$
  );
end $$;
