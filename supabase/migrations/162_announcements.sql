-- 162 · Anuncios globales (banner que ve todo el mundo). Generaliza el
-- maintenance_banner: el canal "Banner" de Comunicaciones publica aquí. UNO
-- activo a la vez (la action desactiva los anteriores). DashboardChrome lee el
-- activo y lo muestra arriba para todos los roles (con severidad + CTA + cierre).
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  cta_label text,
  cta_href text,
  level text not null default 'info' check (level in ('info', 'warn', 'critical')),
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_announcements_active on announcements (active, created_at desc);

alter table announcements enable row level security;

-- Lectura: cualquier autenticado (el banner se muestra a todos los roles).
drop policy if exists ann_authn_select on announcements;
create policy ann_authn_select on announcements for select using (auth.uid() is not null);

-- Mutación: solo admin.
drop policy if exists ann_admin_all on announcements;
create policy ann_admin_all on announcements for all using (mp_is_admin()) with check (mp_is_admin());

-- Audit del banner global.
drop trigger if exists tg_audit_announcements on announcements;
create trigger tg_audit_announcements after insert or update or delete on announcements
  for each row execute function tg_audit();
