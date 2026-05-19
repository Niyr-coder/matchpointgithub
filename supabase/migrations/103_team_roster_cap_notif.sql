-- 103 · Notificación al captain cuando team alcanza el roster cap
-- Trigger after_insert team_members. Si count(members) == cap del plan del
-- captain, encolar notif. Naturalmente "una sola vez" porque cuando el team
-- está al cap, los siguientes inserts fallan a nivel server (Stage 1).
--
-- Si alguien sale y el count baja, el siguiente insert que devuelve a cap
-- re-notifica — comportamiento aceptable (es el momento donde el captain
-- debería ver el recordatorio del upgrade).

-- 1) Seed del kind.
insert into notification_kinds (kind, description, allowed_roles, default_channels, category) values
  (
    'team_roster_cap_reached',
    'Tu team alcanzó el roster máximo según tu plan',
    array['user']::mp_role[],
    array['inapp']::mp_notification_channel[],
    'social'
  )
on conflict (kind) do nothing;

-- 2) Trigger function.
create or replace function fn_notify_team_cap_reached()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_captain_id uuid;
  v_team_name text;
  v_caps jsonb;
  v_plan text;
  v_max int;
  v_body text;
begin
  -- Datos del team.
  select captain_id, name into v_captain_id, v_team_name
  from teams where id = new.team_id;
  if v_captain_id is null then return new; end if;

  -- Plan del captain.
  select coalesce(plan_tier, 'free') into v_plan
  from profiles where id = v_captain_id;

  -- Cap del roster según plan, leído de platform_config.
  select value into v_caps from platform_config where key = 'team_caps';
  if v_caps is null then return new; end if;
  v_max := (v_caps -> v_plan ->> 'rosterMax')::int;
  if v_max is null then return new; end if;

  -- Count actual de miembros (incluye el row recién insertado).
  select count(*) into v_count from team_members where team_id = new.team_id;
  if v_count <> v_max then return new; end if;

  -- Body distinto si ya es premium (no hay upgrade más alto).
  if v_plan = 'premium' then
    v_body := 'Tu team "' || v_team_name || '" alcanzó el máximo de ' || v_max || ' miembros.';
  else
    v_body := 'Tu team "' || v_team_name || '" alcanzó el máximo de ' || v_max || ' miembros. Activa MatchPoint+ para subir el límite a 24.';
  end if;

  perform fn_enqueue_notification(
    v_captain_id,
    'user'::mp_role,
    'team_roster_cap_reached',
    'Tu team está al máximo',
    v_body,
    jsonb_build_object(
      'teamId', new.team_id,
      'teamName', v_team_name,
      'capacity', v_max,
      'planTier', v_plan
    )
  );

  return new;
end;
$$;

-- 3) Trigger en team_members.
drop trigger if exists tg_team_cap_notif on team_members;
create trigger tg_team_cap_notif
  after insert on team_members
  for each row execute function fn_notify_team_cap_reached();
