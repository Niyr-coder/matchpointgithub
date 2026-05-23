-- 142 · Quedadas — "Reglas clave" editables por el organizador.
--
-- rules: jsonb array de { text: string, warn: boolean }. warn=true → regla de
-- advertencia (⚠, ej. "WO si no se presenta"); warn=false → informativa (✓).
-- Se muestran en el modal de detalles. RLS sin cambios (columna de quedadas;
-- mutación gobernada por las policies existentes de la quedada).

alter table public.quedadas
  add column if not exists rules jsonb not null default '[]'::jsonb;
