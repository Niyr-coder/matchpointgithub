-- 2026-07-22 · Quedadas — walk-ins manuales (guests sin cuenta MatchPoint).
--
-- El organizador puede agregar jugadores que llegan sin app/cuenta ("walk-ins"),
-- estilo torneos (registrations.guest_names), pero acá el walk-in JUEGA: entra al
-- roster (quedada_pairs), al motor de emparejamiento y a los standings. Por eso
-- se modela como fila con UUID propio (quedada_guests) y NO como array de texto:
-- los engines operan sobre IDs opacos y un guest-id pasa transparente.
--
-- Para que quedada_pairs / quedada_games puedan referenciar guests O perfiles,
-- se reemplazan las FKs directas a profiles por un trigger de validación
-- (el id debe existir en profiles o en quedada_guests de la MISMA quedada).
-- Tradeoff documentado: se pierde el cascade al borrar un profile; la limpieza
-- de roster al salir un jugador ya la hace leaveQuedada, y el borrado de la
-- quedada sigue cascadeando todo (quedada_id).

-- ── quedada_guests ────────────────────────────────────────────────────────────
create table if not exists public.quedada_guests (
  id uuid primary key default gen_random_uuid(),
  quedada_id uuid not null references public.quedadas(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  paid boolean not null default false,
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_quedada_guests_quedada on public.quedada_guests (quedada_id);

-- ── RLS (mismo contrato que rounds/games: lee quien ve la quedada, muta gestión) ─
alter table public.quedada_guests enable row level security;

drop policy if exists qgu_select on public.quedada_guests;
create policy qgu_select on public.quedada_guests for select using (
  public.mp_quedada_is_open(quedada_id)
  or public.mp_is_quedada_member(quedada_id, auth.uid())
  or public.mp_quedada_can_manage(quedada_id, auth.uid())
  or public.mp_is_admin()
);
drop policy if exists qgu_write on public.quedada_guests;
create policy qgu_write on public.quedada_guests for all using (
  public.mp_quedada_can_manage(quedada_id, auth.uid()) or public.mp_is_admin()
) with check (
  public.mp_quedada_can_manage(quedada_id, auth.uid()) or public.mp_is_admin()
);

-- ── Audit + realtime ──────────────────────────────────────────────────────────
drop trigger if exists tg_audit_quedada_guests on public.quedada_guests;
create trigger tg_audit_quedada_guests after insert or update or delete on public.quedada_guests
  for each row execute function tg_audit();

alter publication supabase_realtime add table public.quedada_guests;

-- ── Jugador válido = profile O guest de la misma quedada ─────────────────────
create or replace function public.mp_quedada_player_ref_ok(p_quedada uuid, p_player uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_player is null
    or exists (select 1 from public.profiles pr where pr.id = p_player)
    or exists (
      select 1 from public.quedada_guests g
      where g.id = p_player and g.quedada_id = p_quedada
    );
$$;

-- Reemplaza las FKs a profiles de las columnas de jugador (nombres dinámicos por
-- robustez: no dependemos del default <tabla>_<col>_fkey).
do $$
declare
  c record;
begin
  for c in
    select con.conname, rel.relname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and con.contype = 'f'
      and (
        (rel.relname = 'quedada_pairs' and exists (
          select 1 from unnest(con.conkey) k
          join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k
          where a.attname in ('player_a_id', 'player_b_id')
        ))
        or
        (rel.relname = 'quedada_games' and exists (
          select 1 from unnest(con.conkey) k
          join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k
          where a.attname in ('side_a_p1', 'side_a_p2', 'side_b_p1', 'side_b_p2')
        ))
      )
  loop
    execute format('alter table public.%I drop constraint %I', c.relname, c.conname);
  end loop;
end $$;

create or replace function public.tg_quedada_pairs_players_ok()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.mp_quedada_player_ref_ok(new.quedada_id, new.player_a_id) then
    raise exception 'player_a_id % no es profile ni guest de la quedada', new.player_a_id;
  end if;
  if not public.mp_quedada_player_ref_ok(new.quedada_id, new.player_b_id) then
    raise exception 'player_b_id % no es profile ni guest de la quedada', new.player_b_id;
  end if;
  return new;
end;
$$;

drop trigger if exists tg_quedada_pairs_players_ok on public.quedada_pairs;
create trigger tg_quedada_pairs_players_ok
  before insert or update on public.quedada_pairs
  for each row execute function public.tg_quedada_pairs_players_ok();

create or replace function public.tg_quedada_games_players_ok()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.mp_quedada_player_ref_ok(new.quedada_id, new.side_a_p1)
    or not public.mp_quedada_player_ref_ok(new.quedada_id, new.side_a_p2)
    or not public.mp_quedada_player_ref_ok(new.quedada_id, new.side_b_p1)
    or not public.mp_quedada_player_ref_ok(new.quedada_id, new.side_b_p2)
  then
    raise exception 'un lado del game referencia un id que no es profile ni guest de la quedada';
  end if;
  return new;
end;
$$;

drop trigger if exists tg_quedada_games_players_ok on public.quedada_games;
create trigger tg_quedada_games_players_ok
  before insert or update on public.quedada_games
  for each row execute function public.tg_quedada_games_players_ok();

-- Al borrar un guest, sus cupos se limpian igual que leaveQuedada (la action
-- bloquea el borrado si el guest ya tiene games). Refuerzo a nivel DB:
create or replace function public.tg_quedada_guest_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Si era player_a con compañero, el compañero pasa a player_a.
  update public.quedada_pairs
  set player_a_id = player_b_id, player_b_id = null
  where player_a_id = old.id and player_b_id is not null;
  -- Si era player_b, se limpia el hueco.
  update public.quedada_pairs
  set player_b_id = null
  where player_b_id = old.id;
  -- Cupos donde quedaba solo.
  delete from public.quedada_pairs where player_a_id = old.id;
  return old;
end;
$$;

drop trigger if exists tg_quedada_guest_cleanup on public.quedada_guests;
create trigger tg_quedada_guest_cleanup
  before delete on public.quedada_guests
  for each row execute function public.tg_quedada_guest_cleanup();
