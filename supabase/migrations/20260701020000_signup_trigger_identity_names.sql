-- Signup: derivar first_name / last_name en el trigger (no solo display_name).
-- Evita repetir el paso de identidad en onboarding cuando el registro ya
-- capturó nombre y usuario. Backfill de perfiles legacy sin first_name.

create or replace function public.tg_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_display text;
  v_first text;
  v_last text;
begin
  v_username := lower(coalesce(
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    'user_' || substr(new.id::text, 1, 8)
  ));

  v_display := trim(regexp_replace(
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      split_part(new.email, '@', 1)
    ),
    '\s+',
    ' ',
    'g'
  ));

  if v_display = '' then
    v_display := split_part(new.email, '@', 1);
  end if;

  v_first := initcap(split_part(v_display, ' ', 1));

  if position(' ' in v_display) > 0 then
    v_last := initcap(trim(substring(v_display from position(' ' in v_display) + 1)));
  else
    v_last := null;
  end if;

  insert into public.profiles (id, username, display_name, first_name, last_name, locale)
  values (
    new.id,
    v_username,
    v_display,
    nullif(v_first, ''),
    nullif(v_last, ''),
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
end;
$$;

-- Perfiles creados antes del sync en auth.signUp: tienen display_name + username
-- pero first_name vacío → onboarding repetía identidad.
update public.profiles p
set
  first_name = initcap(split_part(d.normalized, ' ', 1)),
  last_name = case
    when position(' ' in d.normalized) > 0 then
      initcap(trim(substring(d.normalized from position(' ' in d.normalized) + 1)))
    else null
  end
from (
  select
    id,
    trim(regexp_replace(coalesce(nullif(trim(display_name), ''), username), '\s+', ' ', 'g')) as normalized
  from public.profiles
  where first_name is null
    and username is not null
    and trim(username) <> ''
    and coalesce(nullif(trim(display_name), ''), username) <> ''
) d
where p.id = d.id
  and d.normalized <> '';
