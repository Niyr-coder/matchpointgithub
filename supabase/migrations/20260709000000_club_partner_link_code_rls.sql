-- clubs.partner_link_code quedaba expuesto vía clubs_public_select
-- (using (status='active')): RLS es a nivel de fila, no de columna, así
-- que cualquier select directo de esa columna sobre un club activo
-- devolvía el código completo a cualquier anon/authenticated. La
-- revocamos a nivel columna y servimos las 2 lecturas legítimas (el
-- propio club ve/rota su código; un partner externo valida un código que
-- le pasaron fuera de banda) vía SECURITY DEFINER, que bypasea el grant
-- de columna con su propio chequeo explícito.

revoke select (partner_link_code) on public.clubs from anon, authenticated;

create or replace function public.fn_get_club_partner_link_code(p_club_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not (mp_club_staff(p_club_id) or mp_is_admin()) then
    raise exception 'AUTH.ROLE_REQUIRED' using errcode = '42501';
  end if;
  select partner_link_code into v_code from public.clubs where id = p_club_id;
  return v_code;
end;
$$;

-- Lookup exacto por código (no lista/enumera clubes) -- para que un
-- partner externo con un código recibido fuera de banda pueda
-- auto-vincularse sin necesitar SELECT directo sobre la columna.
create or replace function public.fn_resolve_club_by_partner_link_code(p_code text)
returns table(id uuid, status text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.status from public.clubs c where c.partner_link_code = p_code;
$$;

grant execute on function public.fn_get_club_partner_link_code(uuid) to authenticated;
grant execute on function public.fn_resolve_club_by_partner_link_code(text) to authenticated;
