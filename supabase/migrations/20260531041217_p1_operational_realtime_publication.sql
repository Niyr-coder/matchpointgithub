-- P1 · Realtime publication para señales operativas usadas por pantallas críticas.
-- Idempotente: solo agrega tablas existentes que todavía no estén publicadas.

do $$
declare
  _table text;
  _tables text[] := array[
    'reservation_payments',
    'quedada_reports',
    'inventory_movements'
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
