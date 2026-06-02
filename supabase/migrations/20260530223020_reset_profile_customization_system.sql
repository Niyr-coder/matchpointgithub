-- Reset del sistema anterior de personalizacion de perfil.
-- No reescribe migraciones historicas: retira tablas, columnas y flags vivos
-- para dejar el espacio listo para un diseno nuevo.

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profile_cosmetic_grants'
  ) then
    alter publication supabase_realtime drop table public.profile_cosmetic_grants;
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cosmetic_bundles'
  ) then
    alter publication supabase_realtime drop table public.cosmetic_bundles;
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'theme_settings'
  ) then
    alter publication supabase_realtime drop table public.theme_settings;
  end if;
end $$;

drop table if exists public.profile_cosmetic_grants cascade;
drop table if exists public.theme_settings cascade;
drop table if exists public.cosmetic_bundles cascade;

alter table if exists public.profiles
  drop column if exists accent_color,
  drop column if exists banner_preset,
  drop column if exists card_style;

delete from public.feature_flag_assignments
where flag_key in (
  'profile_customization',
  'paywall_enforce_profile_customization'
);

delete from public.feature_flags
where key in (
  'profile_customization',
  'paywall_enforce_profile_customization'
);
