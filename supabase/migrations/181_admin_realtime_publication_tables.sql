-- 181 · Realtime publication: tablas admin usadas por hooks existentes.
-- Idempotente: solo agrega tablas existentes que todavía no estén publicadas.

do $$
declare
  _table text;
  _tables text[] := array[
    'reports',
    'moderation_actions',
    'events',
    'event_registrations',
    'role_requests',
    'paywall_events',
    'team_reports'
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
