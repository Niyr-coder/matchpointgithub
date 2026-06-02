-- P0 · Realtime para mensajería.
-- MensajesScreenView escucha estas tablas con postgres_changes; sin estar en
-- supabase_realtime, la UI queda stale aunque las RLS de mensajería ya existan
-- desde la migración 016.

do $$
declare
  _table text;
  _tables text[] := array[
    'conversations',
    'conversation_members',
    'messages'
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
