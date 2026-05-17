-- 037 · Teams: transfer_team_captain() + team_join_requests para teams públicos.

-- ── transfer_team_captain (SECURITY DEFINER) ─────────────────────────
-- La policy teams_captain_write tiene WITH CHECK (captain_id = auth.uid()),
-- así que un UPDATE directo cambiando captain_id falla — el nuevo valor no
-- coincide con auth.uid(). Esta función bypasea RLS con validación explícita.
create or replace function transfer_team_captain(p_team_id uuid, p_new_captain_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_captain uuid;
  v_is_member boolean;
begin
  select captain_id into v_current_captain from teams where id = p_team_id;
  if v_current_captain is null then
    raise exception 'TEAMS.NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_current_captain <> auth.uid() then
    raise exception 'AUTH.ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_new_captain_id = v_current_captain then
    raise exception 'TEAMS.SAME_CAPTAIN' using errcode = '22023';
  end if;
  select exists(
    select 1 from team_members
    where team_id = p_team_id and user_id = p_new_captain_id
  ) into v_is_member;
  if not v_is_member then
    raise exception 'TEAMS.NEW_CAPTAIN_NOT_MEMBER' using errcode = '22023';
  end if;

  update teams set captain_id = p_new_captain_id where id = p_team_id;
  update team_members set role = 'captain'
    where team_id = p_team_id and user_id = p_new_captain_id;
  update team_members set role = 'player'
    where team_id = p_team_id and user_id = v_current_captain;
end;
$$;

revoke all on function transfer_team_captain(uuid, uuid) from public;
grant execute on function transfer_team_captain(uuid, uuid) to authenticated;

-- ── team_join_requests ────────────────────────────────────────────────
-- Para teams con privacy='public' o 'invite': users solicitan unirse, captain aprueba/rechaza.
create table if not exists team_join_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  message text,
  created_at timestamptz default now() not null,
  responded_at timestamptz,
  unique (team_id, user_id, status) deferrable initially deferred
);

create index if not exists team_join_requests_team_status_idx
  on team_join_requests (team_id, status);
create index if not exists team_join_requests_user_idx
  on team_join_requests (user_id, created_at desc);

alter table team_join_requests enable row level security;

-- User ve sus propias requests; captain ve las del team que dirige.
drop policy if exists tjr_visible on team_join_requests;
create policy tjr_visible on team_join_requests for select using (
  user_id = auth.uid()
  or exists(select 1 from teams t where t.id = team_id and t.captain_id = auth.uid())
);

-- User crea una request para sí mismo, siempre que el team no sea 'private'.
drop policy if exists tjr_user_create on team_join_requests;
create policy tjr_user_create on team_join_requests for insert with check (
  user_id = auth.uid()
  and exists(
    select 1 from teams t
    where t.id = team_id
      and coalesce(t.privacy, 'public') in ('public', 'invite')
  )
);

-- User puede cancelar la propia (delete o update a cancelled).
drop policy if exists tjr_user_cancel on team_join_requests;
create policy tjr_user_cancel on team_join_requests for delete using (user_id = auth.uid());
drop policy if exists tjr_user_update_self on team_join_requests;
create policy tjr_user_update_self on team_join_requests for update using (user_id = auth.uid());

-- Captain aprueba/rechaza (update).
drop policy if exists tjr_captain_respond on team_join_requests;
create policy tjr_captain_respond on team_join_requests for update using (
  exists(select 1 from teams t where t.id = team_id and t.captain_id = auth.uid())
);
