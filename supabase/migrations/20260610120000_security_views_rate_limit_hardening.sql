-- P0 · Security hardening: vistas con security_invoker, drop vista huérfana,
-- rate-limit RPC solo service_role.

-- 1) Vista de unread global — no la usa la app (getUnreadCount consulta notifications).
drop view if exists public.v_unread_notifications;

-- 2) tournaments_public_summary — restaurar security_invoker (regresión en 066).
drop view if exists public.tournaments_public_summary;
create view public.tournaments_public_summary
with (security_invoker = true) as
  select
    t.id,
    t.slug,
    t.name,
    t.starts_at,
    t.ends_at,
    t.prize_pool_cents,
    t.entry_fee_cents,
    t.currency,
    t.max_participants,
    t.sport,
    t.format,
    t.status,
    c.name as club_name,
    c.city as club_city,
    (
      select count(*)::bigint
      from registrations r
      where r.tournament_id = t.id
        and r.status = any (array['pending'::text, 'accepted'::text])
    ) as registrations_count,
    t.is_featured
  from tournaments t
  left join clubs c on c.id = t.club_id
  where t.status <> all (array['draft'::mp_event_status, 'cancelled'::mp_event_status]);

grant select on public.tournaments_public_summary to anon, authenticated;

-- 3) v_public_profiles — invoker para respetar RLS de profiles.
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
    created_at
  from profiles;

grant select on public.v_public_profiles to anon, authenticated;

-- 4) active_sponsor_placements — invoker (SELECT ya filtra activos).
drop view if exists public.active_sponsor_placements;
create view public.active_sponsor_placements
with (security_invoker = true, security_barrier = true) as
select
  p.id as placement_id,
  sl.key as slot_key,
  sl.surface,
  sl.label as slot_label,
  p.priority,
  p.headline,
  p.body,
  p.image_url,
  p.image_alt,
  p.target_url,
  p.starts_at,
  p.ends_at,
  s.id as sponsor_id,
  s.name as sponsor_name,
  s.slug as sponsor_slug,
  s.logo_url as sponsor_logo_url,
  s.website_url as sponsor_website_url,
  s.brand_color as sponsor_brand_color
from public.sponsor_placements p
join public.sponsors s on s.id = p.sponsor_id
join public.sponsor_slots sl on sl.id = p.slot_id
where p.status = 'active'
  and s.status = 'active'
  and sl.is_active
  and p.starts_at <= now()
  and (p.ends_at is null or p.ends_at > now());

grant select on public.active_sponsor_placements to anon, authenticated;

-- 5) Rate limit: solo service_role (app llama vía getAdminClient).
revoke all on function public.fn_rate_limit_consume(text, int, numeric, numeric)
  from anon, authenticated, public;
grant execute on function public.fn_rate_limit_consume(text, int, numeric, numeric)
  to service_role;
