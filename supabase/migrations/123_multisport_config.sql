-- 123 · Multideporte: switch global. Default OFF = solo Pickleball en toda
-- la plataforma (selectores, modales, forms, filtros). Ver docs/product/05-multisport.md.
--
-- platform_config tiene RLS admin-only, así que exponemos el flag con un RPC
-- público SECURITY DEFINER (patrón de fn_get_system_user_id, mig 104) para que
-- el root layout (anon o authenticated) lo lea y lo provea al cliente.

insert into platform_config (key, value, description)
values (
  'multisport_enabled',
  'false'::jsonb,
  'Si false, solo Pickleball aparece en toda la plataforma. true = Pickleball + Pádel + Tenis.'
)
on conflict (key) do nothing;

create or replace function fn_multisport_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((value #>> '{}')::boolean, false)
  from public.platform_config
  where key = 'multisport_enabled';
$$;

revoke all on function fn_multisport_enabled() from public;
grant execute on function fn_multisport_enabled() to anon, authenticated;

comment on function fn_multisport_enabled() is
  'Lectura pública del switch multideporte. false = solo Pickleball.';
