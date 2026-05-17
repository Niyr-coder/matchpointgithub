-- 010 · Cash (POS): sessions, transactions, refunds, movements.
-- See 20-database.md §7 and 30-rls.md §4.5.

create table cash_sessions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id),
  opened_by uuid not null references profiles(id),
  opened_at timestamptz not null default now(),
  opening_float_cents int not null default 0,
  closed_by uuid references profiles(id),
  closed_at timestamptz,
  closing_counted_cents int,
  expected_cents int,
  variance_cents int,
  notes text,
  status text not null default 'open' check (status in ('open','closed','reconciled'))
);
create index idx_cash_sessions_club_open on cash_sessions (club_id) where status = 'open';

create table transactions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id),
  cash_session_id uuid references cash_sessions(id),
  kind text not null check (kind in ('reservation','class','proshop_sale','event','tournament','custom')),
  ref_id uuid,
  customer_user_id uuid references profiles(id),
  customer_name text,
  amount_cents int not null,
  currency mp_currency not null,
  method mp_payment_method not null,
  status mp_payment_status not null default 'captured',
  provider text,
  provider_payment_id text,
  receipt_url text,
  created_by uuid references profiles(id),
  created_at timestamptz default now() not null
);
create index idx_transactions_club_date on transactions (club_id, created_at desc);
create index idx_transactions_ref on transactions (ref_id);

-- Backfill FK from reservation_payments
alter table reservation_payments
  add constraint resp_tx_fk foreign key (transaction_id) references transactions(id);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id),
  refund_transaction_id uuid references transactions(id),
  amount_cents int not null,
  reason text not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz default now() not null
);

create table cash_movements (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid not null references cash_sessions(id) on delete cascade,
  kind text not null check (kind in ('deposit','withdrawal','adjustment')),
  amount_cents int not null,
  reason text,
  created_by uuid not null references profiles(id),
  created_at timestamptz default now() not null
);

-- RLS
alter table cash_sessions enable row level security;
create policy cs_staff on cash_sessions for all
  using (mp_club_staff(club_id) or mp_is_employee_of(club_id))
  with check (mp_club_staff(club_id) or mp_is_employee_of(club_id));

alter table transactions enable row level security;
create policy tx_staff_all on transactions for all
  using (mp_club_staff(club_id) or mp_is_employee_of(club_id))
  with check (mp_club_staff(club_id) or mp_is_employee_of(club_id));
create policy tx_customer_select on transactions for select
  using (customer_user_id = auth.uid());

alter table refunds enable row level security;
create policy refunds_staff on refunds for all using (
  exists(select 1 from transactions t where t.id = transaction_id
         and (mp_club_staff(t.club_id) or mp_is_employee_of(t.club_id)))
);

alter table cash_movements enable row level security;
create policy cm_staff on cash_movements for all using (
  exists(select 1 from cash_sessions s where s.id = cash_session_id
         and (mp_club_staff(s.club_id) or mp_is_employee_of(s.club_id)))
);
