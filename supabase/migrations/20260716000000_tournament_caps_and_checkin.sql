-- 20260716000000 · Cupo atómico bajo concurrencia + check-in del día.
--
-- 1) CUPO ATÓMICO: los checks de cupo de la app son count-then-insert — con
--    cientos de jugadores inscribiéndose al abrir inscripciones, dos inserts
--    simultáneos podían colarse sobre el límite (plan antes/durante/después,
--    Fase A). Este trigger es la red de seguridad a nivel DB: serializa las
--    altas por torneo con un lock sobre la fila de tournaments y revalida
--    max_participants (global) y max_teams (categoría) para inscripciones
--    ACTIVAS (pending/accepted). Waitlist no consume cupo y no pasa por el
--    check. La app sigue dando los errores amigables; esto solo ataja el race
--    (el error del trigger llega como TOURNAMENTS.REGISTER_FAILED).
--
-- 2) CHECK-IN: registrations.checked_in_at — el organizador marca presentes
--    el día del torneo antes de sortear/generar el cuadro.

alter table public.registrations
  add column if not exists checked_in_at timestamptz;

comment on column public.registrations.checked_in_at is
  'Check-in del día del torneo (marcado por el organizador). null = no ha llegado.';

create or replace function public.tg_enforce_registration_caps()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_participants int;
  v_max_teams        int;
  v_count            int;
  v_was_active       boolean;
begin
  -- Solo aplica cuando la fila queda en status activo (consume cupo).
  if new.status not in ('pending', 'accepted') then
    return new;
  end if;
  -- En UPDATE, solo cuando ENTRA a activo (ej. promoción desde waitlist);
  -- mover pending→accepted no cambia el consumo de cupo.
  if tg_op = 'UPDATE' then
    v_was_active := old.status in ('pending', 'accepted');
    if v_was_active then
      return new;
    end if;
  end if;

  -- Serializar todas las altas del torneo (lock por fila de tournaments).
  perform 1 from tournaments where id = new.tournament_id for update;

  select max_participants into v_max_participants
    from tournaments where id = new.tournament_id;
  if v_max_participants is not null and v_max_participants > 0 then
    select count(*) into v_count
      from registrations
     where tournament_id = new.tournament_id
       and status in ('pending', 'accepted')
       and id is distinct from new.id;
    if v_count >= v_max_participants then
      raise exception 'El torneo está lleno (cupo global)';
    end if;
  end if;

  if new.category_id is not null then
    select max_teams into v_max_teams
      from tournament_categories where id = new.category_id;
    if v_max_teams is not null and v_max_teams > 0 then
      select count(*) into v_count
        from registrations
       where tournament_id = new.tournament_id
         and category_id = new.category_id
         and status in ('pending', 'accepted')
         and id is distinct from new.id;
      if v_count >= v_max_teams then
        raise exception 'La categoría está llena (cupo por categoría)';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tg_enforce_registration_caps on public.registrations;
create trigger tg_enforce_registration_caps
  before insert or update of status on public.registrations
  for each row execute function public.tg_enforce_registration_caps();
