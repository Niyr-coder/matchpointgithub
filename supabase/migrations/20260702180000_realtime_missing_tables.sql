-- Tablas suscritas vía useRealtimeRefresh en el cliente pero que nunca
-- fueron agregadas al publication supabase_realtime. Sin esta migración,
-- los cambios en estas tablas no llegan al cliente (el hook refresca en
-- silencio sin dispararse nunca).

do $$
declare
  _table text;
  _tables text[] := array[
    -- Rankings / estadísticas de jugador
    'player_stats',
    'ranking_snapshots',
    -- Clases
    'class_sessions',
    'class_enrollments',
    -- Equipos
    'teams',
    'team_members',
    'team_invites',
    -- Partners
    'partner_orgs',
    'partner_members',
    'partner_club_links',
    -- Ligas
    'leagues',
    -- Suscripciones de destacado de club
    'club_featuring_subscriptions'
  ];
begin
  foreach _table in array _tables loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = _table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', _table);
    end if;
  end loop;
end $$;
