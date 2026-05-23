-- 152 · Metadata de feature flags (env, impact, owner, segment).
-- Da backend real a los campos del panel admin de flags (rediseño v2): entorno,
-- nivel de impacto/criticidad, owner y descripción del segmento de targeting.
-- Ver 20-database.md §23 (feature flags) y 30-rls.md §4.20.

alter table feature_flags
  add column if not exists env text not null default 'prod'
    check (env in ('prod', 'staging', 'beta', 'dev')),
  add column if not exists impact text not null default 'med'
    check (impact in ('low', 'med', 'high')),
  add column if not exists owner text,
  add column if not exists segment text;

comment on column feature_flags.env is 'Entorno objetivo del flag (prod/staging/beta/dev).';
comment on column feature_flags.impact is 'Nivel de impacto: low/med/high. high = crítico (kill switch lo respeta).';
comment on column feature_flags.owner is 'Responsable del flag (texto libre: nombre o email).';
comment on column feature_flags.segment is 'Descripción del segmento de targeting (texto libre).';
