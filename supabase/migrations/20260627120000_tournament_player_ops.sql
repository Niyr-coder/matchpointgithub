-- 20260627120000 · Sistema de sustituciones de jugadores y walkover en torneos.
--
-- Flujo A — Sustitución: el partner reemplaza un player_id en una inscripción
--   aceptada. Se guarda historial en registration_substitutions.
-- Flujo B — Walkover: el partner declara que un equipo no se presentó.
--   bracket_matches y tournament_group_matches reciben walkover_reason.

-- ── Historial de sustituciones ───────────────────────────────────────────────

create table public.registration_substitutions (
  id              uuid        primary key default gen_random_uuid(),
  tournament_id   uuid        not null references public.tournaments(id)    on delete cascade,
  registration_id uuid        not null references public.registrations(id)  on delete cascade,
  out_player_id   uuid        not null references public.profiles(id),
  in_player_id    uuid        not null references public.profiles(id),
  reason          text        not null
    check (reason in ('injury', 'no_show', 'voluntary', 'other')),
  notes           text,
  authorized_by   uuid        not null references public.profiles(id),
  created_at      timestamptz not null default now()
);

create index idx_reg_subs_tournament    on public.registration_substitutions (tournament_id);
create index idx_reg_subs_registration on public.registration_substitutions (registration_id);

alter table public.registration_substitutions enable row level security;

create policy reg_subs_admin_all on public.registration_substitutions
  for all using (mp_is_admin());

create policy reg_subs_partner_all on public.registration_substitutions
  for all using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.partner_id is not null
        and mp_is_partner_admin_of(t.partner_id)
    )
  );

create policy reg_subs_out_player_select on public.registration_substitutions
  for select using (out_player_id = auth.uid());

create policy reg_subs_in_player_select on public.registration_substitutions
  for select using (in_player_id = auth.uid());

create trigger tg_audit_registration_substitutions
  after insert or update or delete
  on public.registration_substitutions
  for each row execute function tg_audit();

-- ── walkover_reason en partidos ───────────────────────────────────────────────

alter table public.bracket_matches
  add column if not exists walkover_reason text
  check (walkover_reason in ('no_show', 'injury', 'disqualification', 'voluntary_withdrawal'));

alter table public.tournament_group_matches
  add column if not exists walkover_reason text
  check (walkover_reason in ('no_show', 'injury', 'disqualification', 'voluntary_withdrawal'));

-- ── Notification kinds ────────────────────────────────────────────────────────

insert into public.notification_kinds (kind, description, allowed_roles, default_channels, category)
values
  ('player_substituted',
   'Fuiste sustituido en una inscripción de torneo',
   array['user']::mp_role[],
   array['inapp']::mp_notification_channel[],
   'tournaments'),
  ('player_substitution_added',
   'Te agregaron como reemplazo en una inscripción de torneo',
   array['user']::mp_role[],
   array['inapp']::mp_notification_channel[],
   'tournaments'),
  ('match_walkover_declared',
   'El organizador declaró walkover en un partido en el que estás inscrito',
   array['user']::mp_role[],
   array['inapp']::mp_notification_channel[],
   'tournaments')
on conflict (kind) do nothing;

-- ── Feature flag ──────────────────────────────────────────────────────────────

insert into public.feature_flags (key, description, enabled_default, rollout_pct, env, impact)
values (
  'tournament_player_ops_enabled',
  'Habilita sustitución de jugadores (lesión/no-show/cambio de pareja) y declaración de walkover en torneos. Apagado = operaciones no disponibles.',
  false,
  0,
  'prod',
  'high'
)
on conflict (key) do nothing;
