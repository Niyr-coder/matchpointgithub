-- CRM minimo de ventas sobre sales_leads.
-- Idempotente: agrega campos operativos sin cambiar el intake publico.

alter table public.sales_leads
  add column if not exists status text,
  add column if not exists owner_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists priority text,
  add column if not exists next_follow_up_at timestamptz,
  add column if not exists last_contacted_at timestamptz,
  add column if not exists lost_reason text,
  add column if not exists notes text,
  add column if not exists city text,
  add column if not exists sport text,
  add column if not exists club_size text,
  add column if not exists monthly_events int,
  add column if not exists estimated_value_cents int,
  add column if not exists source_campaign text,
  add column if not exists category text,
  add column if not exists target_city text,
  add column if not exists desired_inventory text,
  add column if not exists budget_range text,
  add column if not exists campaign_goal text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

update public.sales_leads
set status = 'new'
where status is null;

update public.sales_leads
set priority = 'medium'
where priority is null;

alter table public.sales_leads
  alter column status set default 'new',
  alter column status set not null,
  alter column priority set default 'medium',
  alter column priority set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_leads_status_chk'
      and conrelid = 'public.sales_leads'::regclass
  ) then
    alter table public.sales_leads
      add constraint sales_leads_status_chk check (
        status in (
          'new',
          'qualified',
          'contacted',
          'demo_scheduled',
          'demo_completed',
          'pilot',
          'proposal_sent',
          'won',
          'lost',
          'nurture'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_leads_priority_chk'
      and conrelid = 'public.sales_leads'::regclass
  ) then
    alter table public.sales_leads
      add constraint sales_leads_priority_chk check (priority in ('low', 'medium', 'high'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_leads_monthly_events_chk'
      and conrelid = 'public.sales_leads'::regclass
  ) then
    alter table public.sales_leads
      add constraint sales_leads_monthly_events_chk check (monthly_events is null or monthly_events >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_leads_estimated_value_chk'
      and conrelid = 'public.sales_leads'::regclass
  ) then
    alter table public.sales_leads
      add constraint sales_leads_estimated_value_chk check (estimated_value_cents is null or estimated_value_cents >= 0);
  end if;
end $$;

create index if not exists idx_sales_leads_status_recent
  on public.sales_leads (status, occurred_at desc);

create index if not exists idx_sales_leads_next_follow_up
  on public.sales_leads (next_follow_up_at)
  where next_follow_up_at is not null and status not in ('won', 'lost');

create index if not exists idx_sales_leads_owner_status
  on public.sales_leads (owner_user_id, status)
  where owner_user_id is not null;

drop trigger if exists tg_sales_leads_updated_at on public.sales_leads;
create trigger tg_sales_leads_updated_at
  before update on public.sales_leads
  for each row execute function public.tg_set_updated_at();

drop policy if exists sl_admin_select on public.sales_leads;
create policy sl_admin_select on public.sales_leads
  for select using (public.mp_is_admin());

drop policy if exists sl_admin_update on public.sales_leads;
create policy sl_admin_update on public.sales_leads
  for update using (public.mp_is_admin())
  with check (public.mp_is_admin());

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sales_leads'
  ) then
    alter publication supabase_realtime add table public.sales_leads;
  end if;
end $$;
