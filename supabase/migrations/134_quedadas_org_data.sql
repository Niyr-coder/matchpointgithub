-- 134: Quedadas — datos de organización estructurados (banco + premios).
--
-- Reemplazan el texto libre payment_info/prizes_text (mig 133) por estructura
-- editable y consistente entre el wizard de crear y la página de gestión.
-- Decisión: columnas JSONB (datos 1:1 chicos del organizador, se editan en
-- bloque; no se consultan por contenido → no ameritan tablas/RLS nuevas).
--
-- payment_info se reusa como "nota de pago opcional" dentro de payment_account
-- (campo note). prizes_text queda deprecado (no se escribe más desde la UI).
-- RLS: ambas columnas viven en `quedadas` → heredan sus policies (write del
-- creador, read de quien ve la quedada). Sin realtime ni audit nuevos.

alter table public.quedadas
  add column if not exists payment_account jsonb,
  add column if not exists prizes jsonb;

comment on column public.quedadas.payment_account is
  'Datos bancarios del organizador: {bank, accountType: ahorros|corriente, accountNumber, holderName, holderId?, note?}. NULL = no configurado.';
comment on column public.quedadas.prizes is
  'Premios por puesto: [{place, prize, valueCents?}]. NULL/[] = sin premios.';
