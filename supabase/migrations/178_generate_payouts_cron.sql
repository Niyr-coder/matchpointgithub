-- 178 · Payouts automáticos mensuales.
-- Genera payouts por club para el mes cerrado, usando platform_config.take_rate_pct.

create or replace function public.fn_generate_payouts(
  _period_start date default (date_trunc('month', now()) - interval '1 month')::date,
  _period_end_exclusive date default date_trunc('month', now())::date
)
returns table(created int, total_net_cents bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  _take_rate_pct numeric := 10;
  _period_end date := (_period_end_exclusive - interval '1 day')::date;
  _club record;
  _gross_cents bigint;
  _commission_cents bigint;
  _net_cents bigint;
begin
  select coalesce(
    case jsonb_typeof(value)
      when 'number' then (value #>> '{}')::numeric
      when 'string' then (value #>> '{}')::numeric
      else null
    end,
    10
  )
  into _take_rate_pct
  from platform_config
  where key = 'take_rate_pct';
  _take_rate_pct := coalesce(_take_rate_pct, 10);

  created := 0;
  total_net_cents := 0;

  for _club in
    select id, currency
    from clubs
    where status = 'active'
  loop
    if exists (
      select 1
      from payouts
      where scope = 'club'
        and club_id = _club.id
        and period_start = _period_start
        and period_end = _period_end
    ) then
      continue;
    end if;

    select coalesce(sum(amount_cents), 0)
    into _gross_cents
    from transactions
    where club_id = _club.id
      and status = 'captured'
      and created_at >= _period_start
      and created_at < _period_end_exclusive;

    if _gross_cents <= 0 then
      continue;
    end if;

    _commission_cents := round(_gross_cents * (_take_rate_pct / 100.0));
    _net_cents := _gross_cents - _commission_cents;

    insert into payouts (
      scope,
      club_id,
      period_start,
      period_end,
      gross_cents,
      commission_cents,
      net_cents,
      currency,
      status,
      scheduled_for
    )
    values (
      'club',
      _club.id,
      _period_start,
      _period_end,
      _gross_cents::int,
      _commission_cents::int,
      _net_cents::int,
      coalesce(_club.currency, 'USD'),
      'processing',
      now()
    );

    created := created + 1;
    total_net_cents := total_net_cents + _net_cents;
  end loop;

  return next;
end;
$$;

do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'generate-payouts-monthly') then
      perform cron.unschedule('generate-payouts-monthly');
    end if;
    perform cron.schedule(
      'generate-payouts-monthly',
      '10 8 1 * *',
      $$select public.fn_generate_payouts();$$
    );
  end if;
exception
  when undefined_function or undefined_table then
    null;
end $do$;
