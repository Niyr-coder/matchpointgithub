-- 025 · Support tickets.
-- See 20-database.md §22 and 30-rls.md §4.19.

create sequence ticket_code_seq;

create table tickets (
  id uuid primary key default gen_random_uuid(),
  code text unique not null
    default ('TK-' || extract(year from now())::text || '-' || lpad(nextval('ticket_code_seq')::text, 5, '0')),
  club_id uuid references clubs(id),
  opener_id uuid not null references profiles(id),
  assignee_id uuid references profiles(id),
  subject text not null,
  category text not null check (category in ('maintenance','system','customer','billing','other')),
  severity mp_ticket_severity not null default 'medium',
  status mp_ticket_status not null default 'open',
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index idx_tickets_status on tickets (status, severity, created_at desc);
create trigger tg_tickets_updated before update on tickets
  for each row execute function tg_set_updated_at();

create table ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  author_id uuid not null references profiles(id),
  body text not null,
  internal boolean not null default false,
  created_at timestamptz default now() not null
);

create table ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_message_id uuid not null references ticket_messages(id) on delete cascade,
  storage_path text not null,
  mime_type text,
  size_bytes bigint
);

alter table tickets enable row level security;
create policy tk_opener_self on tickets for select using (opener_id = auth.uid());
create policy tk_assignee on tickets for select using (assignee_id = auth.uid());
create policy tk_club_staff on tickets for all using (club_id is not null and mp_club_staff(club_id));
create policy tk_admin_all on tickets for all using (mp_is_admin());
create policy tk_user_open on tickets for insert with check (opener_id = auth.uid());

alter table ticket_messages enable row level security;
create policy tm_visible on ticket_messages for select using (
  exists(select 1 from tickets t where t.id = ticket_id
         and (t.opener_id = auth.uid() or t.assignee_id = auth.uid()
              or (t.club_id is not null and mp_club_staff(t.club_id))
              or mp_is_admin()))
  and (
    internal = false
    or auth.uid() <> (select opener_id from tickets where id = ticket_id)
  )
);
create policy tm_post on ticket_messages for insert with check (author_id = auth.uid());

alter table ticket_attachments enable row level security;
create policy ta_visible on ticket_attachments for select using (
  exists(select 1 from ticket_messages tm
         join tickets t on t.id = tm.ticket_id
         where tm.id = ticket_message_id
           and (t.opener_id = auth.uid() or t.assignee_id = auth.uid()
                or (t.club_id is not null and mp_club_staff(t.club_id))
                or mp_is_admin()))
);
