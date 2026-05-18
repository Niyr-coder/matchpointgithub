-- Sumar las sub-tablas del torneo al publication supabase_realtime para que
-- el panel de gestión (/dashboard/partner/torneo/[id]) reaccione cuando
-- otro partner/admin edita categorías, cronograma o premios en paralelo.
alter publication supabase_realtime add table public.tournament_categories;
alter publication supabase_realtime add table public.tournament_schedule_blocks;
alter publication supabase_realtime add table public.tournament_prizes;
