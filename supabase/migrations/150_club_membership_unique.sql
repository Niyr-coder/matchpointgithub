-- 150 · Una sola membresía por (club, usuario).
-- Modelo simplificado tipo MP+ (un plan_expires_at por perfil): cada usuario
-- tiene UNA fila por club que se renueva/extiende, en vez de filas históricas.
-- La renovación extiende expires_at desde el vencimiento vigente.

drop index if exists public.uq_club_membership_live;
create unique index if not exists uq_club_membership_user_club
  on public.club_memberships (club_id, user_id);
