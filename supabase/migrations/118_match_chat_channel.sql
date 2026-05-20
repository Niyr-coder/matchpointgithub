-- 118 · Chat automático por match (conversations kind='match').
-- Ver docs/architecture/20-database.md §29 y docs/guides/02-notifications.md §8.
--
-- Todo match (casual, reto del RetarModal, o nacido de un "Busco partido")
-- abre su chat al crearse. Espejo de los team_channel (mig 104 + 106):
--   1) conversations.kind suma 'match'.
--   2) conversations.match_id (FK al match, cascade on match delete).
--   3) trigger AFTER INSERT on matches → crea conversación + suma a todos los
--      jugadores de team_a y team_b como conversation_members.

-- ─────────────────────────────────────────────────────────────────────
-- 1) Extender kind de conversations: nuevo 'match'
-- ─────────────────────────────────────────────────────────────────────
alter table public.conversations
  drop constraint if exists conversations_kind_check;
alter table public.conversations
  add constraint conversations_kind_check
  check (kind in ('dm','group','support','club_channel','team_channel','match'));

-- ─────────────────────────────────────────────────────────────────────
-- 2) conversations.match_id (FK al match; cascade on match delete)
-- ─────────────────────────────────────────────────────────────────────
alter table public.conversations
  add column if not exists match_id uuid references public.matches(id) on delete cascade;

create index if not exists idx_conversations_match on public.conversations (match_id);

comment on column public.conversations.match_id is
  'Para kind=match: referencia al partido. Cascade on match delete.';

-- ─────────────────────────────────────────────────────────────────────
-- 3) Crear el chat del match al insertarse el match
-- ─────────────────────────────────────────────────────────────────────
create or replace function fn_create_match_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv_id uuid;
  v_player uuid;
  v_players uuid[];
begin
  -- Crea la conversación. created_by = quien creó el match.
  insert into public.conversations (kind, title, match_id, created_by)
  values ('match', 'Partido', new.id, new.created_by)
  returning id into v_conv_id;

  -- Unión de ambos equipos, sin duplicados (defensa: createMatch ya valida
  -- disjoint, pero el array_cat + distinct evita un doble-insert si algo cambia).
  v_players := array(
    select distinct p
    from unnest(coalesce(new.team_a_player_ids, '{}') || coalesce(new.team_b_player_ids, '{}')) as p
    where p is not null
  );

  foreach v_player in array v_players loop
    insert into public.conversation_members (conversation_id, user_id, role)
    values (
      v_conv_id,
      v_player,
      case when v_player = new.created_by then 'admin' else 'member' end
    )
    on conflict (conversation_id, user_id) do nothing;
  end loop;

  return new;
end;
$$;

drop trigger if exists tg_match_channel_create on public.matches;
create trigger tg_match_channel_create
  after insert on public.matches
  for each row execute function fn_create_match_channel();

comment on function fn_create_match_channel() is
  'Crea la conversación kind=match y agrega a todos los jugadores al crearse un match.';
