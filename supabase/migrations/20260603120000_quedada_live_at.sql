-- Momento en que el organizador pulsó «Iniciar quedada» (status -> live).
alter table public.quedadas
  add column if not exists live_at timestamptz;

comment on column public.quedadas.live_at is
  'Timestamp cuando la quedada pasó a status=live (botón Iniciar quedada).';

-- Quedadas ya en vivo/terminadas: aproximar con updated_at.
update public.quedadas
set live_at = updated_at
where status in ('live', 'finished')
  and live_at is null;
