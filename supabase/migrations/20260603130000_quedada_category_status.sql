-- Estado por categoría: scheduled → active → finished (quedadas multi-categoría).

alter table public.quedada_categories
  add column if not exists status text not null default 'scheduled'
    check (status in ('scheduled', 'active', 'finished'));

alter table public.quedada_categories
  add column if not exists finished_at timestamptz;

-- Quedadas ya finalizadas: todas las categorías cerradas.
update public.quedada_categories qc
set status = 'finished',
    finished_at = coalesce(q.updated_at, now())
from public.quedadas q
where q.id = qc.quedada_id
  and q.status = 'finished';

-- Quedadas en vivo: la primera categoría (por sort_order) queda activa.
with first_active as (
  select distinct on (qc.quedada_id) qc.id
  from public.quedada_categories qc
  join public.quedadas q on q.id = qc.quedada_id
  where q.status = 'live'
  order by qc.quedada_id, qc.sort_order asc, qc.created_at asc
)
update public.quedada_categories qc
set status = 'active'
from first_active fa
where qc.id = fa.id
  and qc.status = 'scheduled';
