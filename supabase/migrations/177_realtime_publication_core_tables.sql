-- 177 · Realtime publication: tablas core que ya tienen hooks en UI.
-- Varios docs/hooks asumían estas tablas en `supabase_realtime`, pero las
-- migrations previas solo habían agregado notifications, matches, quedadas y
-- algunas subtablas. Idempotente para entornos donde una tabla ya esté publicada.

do $$
declare
  _table text;
  _tables text[] := array[
    'transactions',
    'refunds',
    'payouts',
    'profiles',
    'player_subscriptions',
    'role_assignments',
    'feature_flags',
    'feature_flag_assignments',
    'club_applications',
    'tournaments',
    'registrations',
    'brackets',
    'bracket_matches',
    'reservations',
    'courts',
    'court_pricing',
    'court_blocks',
    'club_settings',
    'walkins',
    'check_ins',
    'cash_sessions',
    'products',
    'sales',
    'tickets',
    'ticket_messages',
    'broadcasts',
    'broadcast_recipients',
    'match_seeks',
    'match_seek_applications',
    'match_no_shows',
    'player_reliability',
    'clubs',
    'club_memberships',
    'club_membership_tiers',
    'announcements',
    'audit_log',
    'profile_cosmetic_grants',
    'cosmetic_bundles',
    'ranking_snapshots',
    'player_stats',
    'club_followers'
  ];
begin
  foreach _table in array _tables loop
    if to_regclass(format('public.%I', _table)) is not null
       and not exists (
         select 1
         from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = _table
       )
    then
      execute format('alter publication supabase_realtime add table public.%I', _table);
    end if;
  end loop;
end $$;
