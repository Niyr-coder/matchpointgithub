-- 104 · Sistema de mensajes "MatchPoint" + team_channel kind
-- Schema base para:
--   1) Perfil oficial "MatchPoint" que envía welcome DMs
--   2) Conversations de tipo team_channel sincronizadas con teams
--   3) Killswitch via platform_config
--
-- Ver docs/architecture/20-database.md §29.13 y docs/guides/02-notifications.md.

-- ─────────────────────────────────────────────────────────────────────
-- 1) profiles.is_system flag
-- ─────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists is_system bool not null default false;

comment on column public.profiles.is_system is
  'True para perfiles de sistema (ej. MatchPoint). RLS RESTRICTIVE bloquea edit; UI muestra badge verified.';

-- ─────────────────────────────────────────────────────────────────────
-- 2) Extender kind de conversations: nuevo team_channel
-- ─────────────────────────────────────────────────────────────────────
alter table public.conversations
  drop constraint if exists conversations_kind_check;
alter table public.conversations
  add constraint conversations_kind_check
  check (kind in ('dm','group','support','club_channel','team_channel'));

-- ─────────────────────────────────────────────────────────────────────
-- 3) conversations.team_id (FK al team; cascade on team delete)
-- ─────────────────────────────────────────────────────────────────────
alter table public.conversations
  add column if not exists team_id uuid references public.teams(id) on delete cascade;

create index if not exists idx_conversations_team on public.conversations (team_id);

comment on column public.conversations.team_id is
  'Para kind=team_channel: referencia al team. Cascade on team delete.';

-- ─────────────────────────────────────────────────────────────────────
-- 4) Seed system user "MatchPoint" (idempotente)
-- ─────────────────────────────────────────────────────────────────────
do $$
declare
  v_system_id uuid;
begin
  select id into v_system_id from public.profiles where is_system = true limit 1;

  if v_system_id is null then
    v_system_id := gen_random_uuid();

    insert into auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
    ) values (
      v_system_id,
      '00000000-0000-0000-0000-000000000000',
      'matchpoint@system.local',
      crypt(gen_random_uuid()::text, gen_salt('bf')),
      now(),
      '{"provider":"system","providers":["system"]}'::jsonb,
      jsonb_build_object(
        'display_name', 'MatchPoint',
        'username',     'matchpoint',
        'locale',       'es'
      ),
      'authenticated',
      'authenticated',
      now(),
      now()
    );

    -- El trigger tg_auth_user_created creó el profile; lo marcamos system.
    update public.profiles set is_system = true where id = v_system_id;

    -- Y revocamos el role_assignment 'user' (el bot no es humano).
    delete from public.role_assignments where user_id = v_system_id;
  end if;

  -- Guardar el ID en platform_config para consumo desde código TS.
  insert into public.platform_config (key, value, description)
  values (
    'system_user_id',
    to_jsonb(v_system_id::text),
    'UUID del perfil oficial "MatchPoint" para system messages.'
  )
  on conflict (key) do update set value = excluded.value;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- 5) Killswitch: system_messages_enabled (default true)
-- ─────────────────────────────────────────────────────────────────────
insert into public.platform_config (key, value, description)
values (
  'system_messages_enabled',
  'true'::jsonb,
  'Master switch para welcome DMs de MatchPoint. Off = todos los hooks no-op.'
)
on conflict (key) do nothing;

-- ─────────────────────────────────────────────────────────────────────
-- 6) RLS RESTRICTIVE: nadie puede editar el system user via JWT del user.
-- (Service role / admin client bypassa RLS, eso es by-design.)
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists profiles_no_system_mutation on public.profiles;
create policy profiles_no_system_mutation on public.profiles
  as restrictive
  for update
  using (not is_system)
  with check (not is_system);

drop policy if exists profiles_no_system_delete on public.profiles;
create policy profiles_no_system_delete on public.profiles
  as restrictive
  for delete
  using (not is_system);

-- ─────────────────────────────────────────────────────────────────────
-- 7) RPC público para leer el system_user_id sin pegar a platform_config.
-- platform_config tiene RLS admin-only; cualquier authenticated necesita
-- el id para mostrar el badge verified en MensajesScreen.
-- ─────────────────────────────────────────────────────────────────────
create or replace function fn_get_system_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select (value #>> '{}')::uuid
  from public.platform_config
  where key = 'system_user_id';
$$;

grant execute on function fn_get_system_user_id() to authenticated;

comment on function fn_get_system_user_id() is
  'Devuelve el UUID del perfil oficial MatchPoint. Lectura pública para authenticated.';
