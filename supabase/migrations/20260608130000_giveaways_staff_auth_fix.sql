-- Admin global puede publicar anuncios/sorteos en cualquier club (alineado con mp_club_staff).
create or replace function public.fn_is_club_announcements_publisher(p_club_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.role_assignments ra
    where ra.user_id = p_user_id
      and ra.role = 'admin'
      and ra.revoked_at is null
  )
  or exists (
    select 1 from public.role_assignments ra
    where ra.club_id = p_club_id
      and ra.user_id = p_user_id
      and ra.role in ('owner','manager')
      and ra.revoked_at is null
  );
$$;
