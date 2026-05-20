-- 138: Fase de grupos + cancha en el motor de quedadas.
--
-- group_no: a qué grupo pertenece el partido (round robin por grupo).
-- court_no: cancha asignada automáticamente (1 grupo → 1 cancha, ciclando si
-- hay más grupos que canchas). Default group_no=1 (un solo grupo).
alter table public.quedada_matches
  add column if not exists group_no int not null default 1,
  add column if not exists court_no int;
