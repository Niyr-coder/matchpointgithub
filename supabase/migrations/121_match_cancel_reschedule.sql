-- 121 · Ciclo de vida post-aceptación de matches: cancelar + reprogramar.
-- Ver docs/product/04-matches-lifecycle.md.
--
-- `mp_match_status` ya tiene 'cancelled'. Reprogramar solo cambia played_at
-- (columna existente). Acá agregamos metadata de cancelación + sumamos
-- matches al publication realtime para que cancel/reschedule se reflejen
-- en vivo en el chat del partido y en "Mis avisos".

alter table matches
  add column if not exists cancelled_by uuid references profiles(id) on delete set null,
  add column if not exists cancelled_reason text,
  add column if not exists cancelled_at timestamptz;

comment on column matches.cancelled_by is
  'Quién canceló el partido (participante o admin). Solo populado si status=cancelled.';

-- Realtime: el chat del partido + "Mis avisos" escuchan cambios del match.
alter publication supabase_realtime add table matches;
