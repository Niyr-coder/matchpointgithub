-- 102 · Team caps por plan (free/premium)
-- Roster, invites pendientes y renames del team gated según plan del captain.
-- Caps viven en platform_config para ajustar sin redeploy.
-- Ver docs/product/00-matchpoint-plus.md y docs/guides/07-new-feature-checklist.md

-- 1) Columna rename_count en teams: counter incremental al renombrar.
alter table public.teams
  add column if not exists rename_count int not null default 0;

comment on column public.teams.rename_count is
  'Contador de renames (nombre o slug). Free cap: 2. Premium cap: 5. Ver platform_config.team_caps.';

-- 2) Seed de team_caps en platform_config. Si ya existe, no sobreescribe.
insert into public.platform_config (key, value, description) values
  ('team_caps',
   '{
      "free":    { "rosterMax": 12, "pendingInvitesMax": 3,    "renamesMax": 2 },
      "premium": { "rosterMax": 24, "pendingInvitesMax": null, "renamesMax": 5 }
    }'::jsonb,
   'Caps del feature teams según plan del captain. pendingInvitesMax=null => ilimitado.')
on conflict (key) do nothing;

-- 3) RPC SECURITY DEFINER para que cualquier authenticated pueda leer team_caps.
-- platform_config tiene RLS restrictiva (solo admin lee). Patrón ya usado en
-- fn_unread_messages_count y fn_unique_organizers_count.
create or replace function fn_get_team_caps()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select value from public.platform_config where key = 'team_caps';
$$;

grant execute on function fn_get_team_caps() to authenticated;

comment on function fn_get_team_caps() is
  'Devuelve el JSON de caps por plan para feature teams. Lectura pública para authenticated.';
