-- 168 · courts: apariencia visual (SVG card en owner) + ventana de mantenimiento.
-- Habilita el rediseño de Owner · Canchas v2: cada court renderiza su SVG real
-- (color de superficie + líneas) en vez de un placeholder genérico, y soporta
-- una nota de mantenimiento con fecha estimada de retorno.
--
-- Defaults sensatos por sport-agnostic (#10b981 emerald estilo court pickleball
-- típico, líneas blancas). Los flujos existentes (createCourt / updateCourt) no
-- requieren estos campos — son opcionales.

alter table courts
  add column if not exists surface_color text not null default '#10b981',
  add column if not exists lines_color text not null default '#ffffff',
  add column if not exists line_style text not null default 'classic'
    check (line_style in ('classic', 'showcourt', 'minimal')),
  add column if not exists stroke_width int not null default 3
    check (stroke_width between 1 and 6),
  add column if not exists maintenance_reason text,
  add column if not exists maintenance_until timestamptz;

-- La policy courts_staff_write existente cubre updates de estos cols.
-- No requiere trigger porque no afectan reservations ni cross-tenant data.
