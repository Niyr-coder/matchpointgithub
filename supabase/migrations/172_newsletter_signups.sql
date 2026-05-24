-- 171 · Newsletter signups: telemetría de inscripciones al newsletter del blog.
--
-- El endpoint POST /api/newsletter/subscribe inserta un row aquí en cada
-- intento (idempotente por (email_lc, source)). Mantenemos el email en su
-- casing original + email_lc lowercased para el dedupe, así no perdemos lo
-- que el usuario escribió pero seguimos siendo case-insensitive.
--
-- `resend_contact_id` queda nullable: si Resend audiences falla o aún no hay
-- audience configurada, la telemetría sigue funcionando y un job futuro
-- puede backfill-ear los contactos.
create table if not exists newsletter_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  email_lc text generated always as (lower(email)) stored,
  source text not null default 'blog',
  occurred_at timestamptz not null default now(),
  resend_contact_id text,
  status text not null default 'subscribed'
    check (status in ('subscribed', 'already_subscribed', 'failed')),
  ip inet,
  user_agent text,
  metadata jsonb
);

create unique index if not exists ux_newsletter_signups_email_source
  on newsletter_signups (email_lc, source);

create index if not exists idx_newsletter_signups_occurred_at
  on newsletter_signups (occurred_at desc);

alter table newsletter_signups enable row level security;

-- Insert: solo el service role (la API route usa admin client). Sin policy
-- para anon/authenticated → cliente no puede escribir directo.
drop policy if exists newsletter_signups_admin_all on newsletter_signups;
create policy newsletter_signups_admin_all on newsletter_signups
  for all using (mp_is_admin()) with check (mp_is_admin());
