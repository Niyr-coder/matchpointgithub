-- Retos: aceptación explícita antes de sumar rivales al chat del partido.

alter table public.matches
  add column if not exists accepted_by uuid[] not null default '{}';

comment on column public.matches.accepted_by is
  'Jugadores que aceptaron el duelo. El chat kind=match solo incluye a quienes figuran aquí.';

-- Backfill: partidos existentes se consideran ya aceptados por todos.
update public.matches m
set accepted_by = array(
  select distinct p
  from unnest(coalesce(m.team_a_player_ids, '{}') || coalesce(m.team_b_player_ids, '{}')) as p
  where p is not null
)
where coalesce(array_length(m.accepted_by, 1), 0) = 0;

create or replace function public.fn_create_match_channel()
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
  insert into public.conversations (kind, title, match_id, created_by)
  values ('match', 'Partido', new.id, new.created_by)
  returning id into v_conv_id;

  v_players := coalesce(new.accepted_by, '{}'::uuid[]);
  if coalesce(array_length(v_players, 1), 0) = 0 then
    v_players := array[new.created_by];
  end if;

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

comment on function public.fn_create_match_channel() is
  'Crea el chat kind=match y agrega solo jugadores que ya aceptaron el duelo.';
