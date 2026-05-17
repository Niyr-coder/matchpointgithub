-- 036 · Teams: invite_code + privacy + captain-cancels-invites policy.
-- Habilita los flujos joinTeamByCode y cancelInvite que la UI ya tiene preparados.

-- ── columnas nuevas en teams ──────────────────────────────────────────
alter table teams
  add column if not exists privacy text not null default 'public'
    check (privacy in ('public', 'invite', 'private')),
  add column if not exists invite_code text;

-- Generador de códigos legibles tipo HDN-7M2K-X9P (12 chars alfanuméricos sin O/0/I/1).
create or replace function gen_team_invite_code() returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
begin
  for i in 1..10 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  -- formato visual: 3-4-3
  return substr(code, 1, 3) || '-' || substr(code, 4, 4) || '-' || substr(code, 8, 3);
end;
$$;

-- Backfill: todo team existente recibe un código único.
do $$
declare
  rec record;
  new_code text;
begin
  for rec in select id from teams where invite_code is null loop
    loop
      new_code := gen_team_invite_code();
      exit when not exists (select 1 from teams where invite_code = new_code);
    end loop;
    update teams set invite_code = new_code where id = rec.id;
  end loop;
end;
$$;

alter table teams alter column invite_code set not null;
alter table teams add constraint teams_invite_code_key unique (invite_code);

-- Default para nuevos teams: el captain puede regenerar con updateTeam si quiere.
-- Nota: el default usa la función; si dos teams colisionan en el mismo tick el
-- INSERT falla con 23505 y la action retorna TEAMS.CODE_COLLISION (raro pero posible).
alter table teams alter column invite_code set default gen_team_invite_code();

-- ── policy: captain puede UPDATE/DELETE invites de su team ────────────
-- La policy existente ti_respond solo permite al invited_user. Faltaba la del captain
-- para cancelar invitaciones salientes.
drop policy if exists ti_captain_manage on team_invites;
create policy ti_captain_manage on team_invites for update using (
  exists(select 1 from teams t where t.id = team_id and t.captain_id = auth.uid())
);
