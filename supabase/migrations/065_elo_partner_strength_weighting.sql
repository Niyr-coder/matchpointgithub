-- Para doubles: cada jugador recibe delta ponderado por (team_avg / su_rating)
-- normalizado al tamaño del team. Singles queda igual (factor=1). Guarda
-- rating_deltas en el match para que la UI muestre el delta por jugador.
-- Ver migration 064 para context del split singles/doubles.
alter table public.matches
  add column if not exists rating_deltas jsonb not null default '{}'::jsonb;

-- (función rewrite — definición completa idéntica a la aplicada vía MCP en
--  apply_migration 065_elo_partner_strength_weighting)
