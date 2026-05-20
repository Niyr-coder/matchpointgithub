-- 135: Plantillas de Quedada con nombre (hasta 5 por usuario).
--
-- Config personal del organizador (snapshot del wizard) para repetir armados
-- sin reconfigurar. Es data privada tipo "borrador/preset" del propio usuario:
--   - RLS: solo el dueño ve/gestiona (user_id = auth.uid()).
--   - Sin audit ni path admin: no es entidad moderable cross-tenant, es config
--     personal (como filtros guardados). El cap (5) se valida en la action.
--   - Sin realtime: nadie la escucha en vivo.
-- `config` jsonb = el QuedadaInitial del wizard (sin fecha).

create table if not exists public.quedada_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  config jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists quedada_templates_user_idx
  on public.quedada_templates (user_id, created_at desc);

alter table public.quedada_templates enable row level security;

create policy quedada_templates_select on public.quedada_templates
  for select using (user_id = auth.uid());
create policy quedada_templates_insert on public.quedada_templates
  for insert with check (user_id = auth.uid());
create policy quedada_templates_update on public.quedada_templates
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy quedada_templates_delete on public.quedada_templates
  for delete using (user_id = auth.uid());
