-- 153 · Nombre editable de feature flags (`label`).
-- Permite renombrar el nombre visible de un flag/feature desde el panel admin,
-- sin cambiar la `key` (que el código usa). Precedencia de nombre en la UI:
-- label (override del admin) → registro de código → titleize(key).
-- Ver 20-database.md §23 (feature flags).

alter table feature_flags
  add column if not exists label text;

comment on column feature_flags.label is 'Nombre visible editable del flag (override del admin). NULL = usar registro/key.';