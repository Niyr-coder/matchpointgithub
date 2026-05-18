-- Habilita realtime para notifications: el listener del bell se entera
-- de inserts/updates al instante y dispara wiggle + badge pop.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end$$;
