-- P2 · Profiles RLS estricto (feature flag `profiles_rls_strict`, default OFF).
-- Con flag OFF: comportamiento legacy (cualquier autenticado lee profiles).
-- Con flag ON: self, amigos, solicitudes pendientes, staff de club, co-inscritos,
-- conversaciones compartidas, admin.

insert into feature_flags (key, description, enabled_default, rollout_pct, env, impact, label)
values (
  'profiles_rls_strict',
  'Activa RLS estricta en profiles: sin SELECT masivo para autenticados. Encender tras validar pantallas en staging.',
  false,
  0,
  'prod',
  'high',
  'Profiles RLS estricto'
)
on conflict (key) do update set
  description = excluded.description,
  label = excluded.label;

-- ── Helpers ─────────────────────────────────────────────────────────────

create or replace function public.mp_profiles_strict_rls_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select enabled_default from feature_flags where key = 'profiles_rls_strict'),
    false
  );
$$;

create or replace function public.mp_are_friends(p_viewer uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_viewer = p_target
    or exists (
      select 1
      from friendships f
      where (f.user_a = p_viewer and f.user_b = p_target)
         or (f.user_a = p_target and f.user_b = p_viewer)
    );
$$;

create or replace function public.mp_profile_friend_request_visible(p_viewer uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from friend_requests fr
    where fr.status = 'pending'
      and (
        (fr.from_user_id = p_viewer and fr.to_user_id = p_target)
        or (fr.to_user_id = p_viewer and fr.from_user_id = p_target)
      )
  );
$$;

create or replace function public.mp_profile_visible_to_club_staff(p_viewer uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from role_assignments ra
    join reservations r on r.club_id = ra.club_id
    where ra.user_id = p_viewer
      and ra.revoked_at is null
      and ra.role in ('admin', 'owner', 'manager', 'employee')
      and (
        r.organizer_id = p_target
        or exists (
          select 1
          from reservation_participants rp
          where rp.reservation_id = r.id
            and rp.user_id = p_target
        )
      )
  )
  or exists (
    select 1
    from role_assignments ra
    join tournaments t on t.club_id = ra.club_id
    join registrations reg on reg.tournament_id = t.id
    where ra.user_id = p_viewer
      and ra.revoked_at is null
      and ra.role in ('admin', 'owner', 'manager', 'employee')
      and (
        reg.registered_by = p_target
        or reg.player_ids @> array[p_target]
      )
  );
$$;

create or replace function public.mp_profile_co_registered(p_viewer uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from registrations r1
    join registrations r2 on r1.tournament_id = r2.tournament_id
    where r1.id <> r2.id
      and (
        r1.registered_by = p_viewer
        or r1.player_ids @> array[p_viewer]
      )
      and (
        r2.registered_by = p_target
        or r2.player_ids @> array[p_target]
      )
  );
$$;

create or replace function public.mp_profile_shares_conversation(p_viewer uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from conversation_members cm1
    join conversation_members cm2 on cm1.conversation_id = cm2.conversation_id
    where cm1.user_id = p_viewer
      and cm2.user_id = p_target
      and cm1.left_at is null
      and cm2.left_at is null
  );
$$;

revoke all on function public.mp_profiles_strict_rls_enabled() from public;
revoke all on function public.mp_are_friends(uuid, uuid) from public;
revoke all on function public.mp_profile_friend_request_visible(uuid, uuid) from public;
revoke all on function public.mp_profile_visible_to_club_staff(uuid, uuid) from public;
revoke all on function public.mp_profile_co_registered(uuid, uuid) from public;
revoke all on function public.mp_profile_shares_conversation(uuid, uuid) from public;

grant execute on function public.mp_profiles_strict_rls_enabled() to authenticated, service_role;
grant execute on function public.mp_are_friends(uuid, uuid) to authenticated, service_role;
grant execute on function public.mp_profile_friend_request_visible(uuid, uuid) to authenticated, service_role;
grant execute on function public.mp_profile_visible_to_club_staff(uuid, uuid) to authenticated, service_role;
grant execute on function public.mp_profile_co_registered(uuid, uuid) to authenticated, service_role;
grant execute on function public.mp_profile_shares_conversation(uuid, uuid) to authenticated, service_role;

-- v_public_profiles: is_system para badges oficiales en sugerencias.
drop view if exists public.v_public_profiles;
create view public.v_public_profiles
with (security_invoker = true) as
  select
    id,
    username,
    display_name,
    avatar_url,
    city,
    country,
    preferred_sport,
    skill_level,
    created_at,
    is_system
  from profiles;

grant select on public.v_public_profiles to anon, authenticated;

-- ── Policies ────────────────────────────────────────────────────────────

drop policy if exists profiles_authn_select_limited on public.profiles;

create policy profiles_authn_select_legacy on public.profiles
  for select
  using (
    auth.uid() is not null
    and not public.mp_profiles_strict_rls_enabled()
  );

create policy profiles_strict_select on public.profiles
  for select
  using (
    public.mp_profiles_strict_rls_enabled()
    and (
      id = auth.uid()
      or public.mp_are_friends(auth.uid(), id)
      or public.mp_profile_friend_request_visible(auth.uid(), id)
      or public.mp_profile_visible_to_club_staff(auth.uid(), id)
      or public.mp_profile_co_registered(auth.uid(), id)
      or public.mp_profile_shares_conversation(auth.uid(), id)
      or public.mp_is_admin()
    )
  );
