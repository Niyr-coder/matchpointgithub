-- Agrega el slot "TV Live – Ticker" al catálogo de slots de sponsors.
-- Permite asignar placements desde AdminPatrocinadoresScreen con slot_key='tv_ticker'.
insert into sponsor_slots (key, surface, label, max_active_placements, base_price_cents, is_active)
values ('tv_ticker', 'tv_live', 'TV Live – Ticker', 3, 0, true)
on conflict (key) do nothing;
