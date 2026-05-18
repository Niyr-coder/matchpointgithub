-- 🐛 Bug crítico: signup roto.
-- El trigger tg_handle_new_auth_user usaba `on conflict do nothing` sin
-- target en role_assignments. La unique constraint es de 4 columnas
-- (user_id, role, club_id, partner_id) y NULL != NULL en SQL, así que
-- Postgres no podía decidir qué constraint usar para el conflict y
-- abortaba el insert con "ERROR: there is no unique or exclusion
-- constraint matching the ON CONFLICT specification". Resultado: signup
-- de cualquier usuario devolvía "Database error saving new user".
--
-- Fix: chequear existencia explícita con IF NOT EXISTS, sin on conflict.
create or replace function public.tg_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username',
             'user_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'locale', 'es')
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.role_assignments
    where user_id = new.id and role = 'user'
      and club_id is null and partner_id is null
  ) then
    insert into public.role_assignments (user_id, role)
    values (new.id, 'user');
  end if;

  return new;
end $$;
