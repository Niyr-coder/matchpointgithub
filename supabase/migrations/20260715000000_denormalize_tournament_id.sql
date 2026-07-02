-- 20260715000000 · Denormalizar tournament_id en las tablas de partidos.
--
-- Fix definitivo del fanout global de realtime (audit de costos 2026-07-01,
-- fase 4): bracket_matches / tournament_group_matches / tournament_groups no
-- tenían tournament_id, así que las suscripciones no podían filtrar en el CDC
-- y cada punto anotado en cualquier torneo llegaba a TODOS los clientes de la
-- plataforma. Los quick wins (useScopedRealtimeRefresh) filtran client-side;
-- con cientos de jugadores simultáneos el filtro debe estar en la suscripción.
--
-- La columna se llena sola con triggers BEFORE INSERT (ningún insert del
-- código necesita cambios) y queda NOT NULL tras el backfill.

-- ── 1) Columnas ──────────────────────────────────────────────────────────────
alter table public.bracket_matches
  add column if not exists tournament_id uuid references tournaments(id) on delete cascade;
alter table public.tournament_group_matches
  add column if not exists tournament_id uuid references tournaments(id) on delete cascade;
alter table public.tournament_groups
  add column if not exists tournament_id uuid references tournaments(id) on delete cascade;

-- ── 2) Backfill ──────────────────────────────────────────────────────────────
update public.bracket_matches bm
   set tournament_id = b.tournament_id
  from public.brackets b
 where b.id = bm.bracket_id
   and bm.tournament_id is null;

update public.tournament_groups g
   set tournament_id = c.tournament_id
  from public.tournament_categories c
 where c.id = g.category_id
   and g.tournament_id is null;

update public.tournament_group_matches gm
   set tournament_id = g.tournament_id
  from public.tournament_groups g
 where g.id = gm.group_id
   and gm.tournament_id is null;

-- ── 3) Triggers de auto-llenado (BEFORE INSERT) ──────────────────────────────
create or replace function public.tg_fill_bracket_match_tournament_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tournament_id is null then
    select tournament_id into new.tournament_id from brackets where id = new.bracket_id;
  end if;
  return new;
end;
$$;

drop trigger if exists tg_fill_tournament_id on public.bracket_matches;
create trigger tg_fill_tournament_id
  before insert on public.bracket_matches
  for each row execute function public.tg_fill_bracket_match_tournament_id();

create or replace function public.tg_fill_group_tournament_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tournament_id is null then
    select tournament_id into new.tournament_id from tournament_categories where id = new.category_id;
  end if;
  return new;
end;
$$;

drop trigger if exists tg_fill_tournament_id on public.tournament_groups;
create trigger tg_fill_tournament_id
  before insert on public.tournament_groups
  for each row execute function public.tg_fill_group_tournament_id();

create or replace function public.tg_fill_group_match_tournament_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tournament_id is null then
    select tournament_id into new.tournament_id from tournament_groups where id = new.group_id;
  end if;
  return new;
end;
$$;

drop trigger if exists tg_fill_tournament_id on public.tournament_group_matches;
create trigger tg_fill_tournament_id
  before insert on public.tournament_group_matches
  for each row execute function public.tg_fill_group_match_tournament_id();

-- ── 4) NOT NULL + índices ────────────────────────────────────────────────────
alter table public.bracket_matches alter column tournament_id set not null;
alter table public.tournament_groups alter column tournament_id set not null;
alter table public.tournament_group_matches alter column tournament_id set not null;

create index if not exists idx_bracket_matches_tournament on public.bracket_matches (tournament_id);
create index if not exists idx_tournament_groups_tournament on public.tournament_groups (tournament_id);
create index if not exists idx_group_matches_tournament on public.tournament_group_matches (tournament_id);
