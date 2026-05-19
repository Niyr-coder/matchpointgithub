-- 115 · profile_cosmetic_grants: abrir SELECT a todos los auth.
-- Razón: los listados (AmigosScreen FriendCard, TeamScreenView roster,
-- /players/[username]) renderizan el card_style del owner. Ese card_style
-- ya implica ownership del bundle, así que cualquier auth puede inferirlo.
-- La RLS self-select original era over-restrictive para una feature
-- 100% cosmética.
-- INSERT/UPDATE/DELETE quedan admin-only (no cambia).

drop policy if exists pcg_public_select on public.profile_cosmetic_grants;
create policy pcg_public_select on public.profile_cosmetic_grants
  for select using ( true );

-- Drop la policy vieja self-select (la public la subsume).
drop policy if exists pcg_self_select on public.profile_cosmetic_grants;
