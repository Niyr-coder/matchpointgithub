-- 163 · Plantillas de campañas (Comunicaciones). Admin guarda un composer como
-- plantilla y la reusa. Hace real la grilla "Plantillas guardadas".
create table if not exists broadcast_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text not null default 'inapp',
  title text not null default '',
  body text not null default '',
  cta_label text,
  target_filter jsonb not null default '{}'::jsonb,
  uses int not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_broadcast_templates_created on broadcast_templates (created_at desc);

alter table broadcast_templates enable row level security;

drop policy if exists btpl_admin_all on broadcast_templates;
create policy btpl_admin_all on broadcast_templates for all using (mp_is_admin()) with check (mp_is_admin());

drop trigger if exists tg_audit_broadcast_templates on broadcast_templates;
create trigger tg_audit_broadcast_templates after insert or update or delete on broadcast_templates
  for each row execute function tg_audit();
