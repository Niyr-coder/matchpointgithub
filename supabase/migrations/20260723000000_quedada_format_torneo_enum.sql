-- 2026-07-23 · Quedadas — nuevo formato 'torneo' (Modo Torneo).
-- ADD VALUE va en su propia migración: el valor nuevo de un enum no puede
-- usarse en la misma transacción que lo crea.
alter type public.mp_quedada_format add value if not exists 'torneo';
