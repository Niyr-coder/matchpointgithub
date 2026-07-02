-- 20260717000000 · Fuente única de dinero neto + ref_id unificado + payouts
-- reconciliables (Fase 3 del plan de finanzas, audit 2026-07-01).
--
-- Problema: 9 superficies de revenue sumaban transactions.status='captured'
-- directo — sin restar refunds. Pagar → cancelar → re-inscribirse → pagar
-- aparecía 2× hasta marcar el refund; la comisión se cobraba sobre bruto; y
-- el payout mensual jamás descontaba refunds posteriores (club sobrepagado
-- permanente).

-- ── 1) Vista canónica de dinero reconocido ───────────────────────────────────
-- net_amount_cents = amount_cents − Σ refunds (soporta refunds PARCIALES,
-- donde la tx sigue 'captured' con filas en refunds); 0 si la tx no está
-- captured (pending/failed/refunded-total/etc). security_invoker → aplica la
-- RLS de transactions del caller.
drop view if exists public.v_transactions_net;
create view public.v_transactions_net
with (security_invoker = true) as
  select
    t.*,
    coalesce(r.refunded_cents, 0)::int as refunded_cents,
    case
      when t.status = 'captured'
        then greatest(0, t.amount_cents - coalesce(r.refunded_cents, 0))::int
      else 0
    end as net_amount_cents
  from transactions t
  left join (
    select transaction_id, sum(amount_cents) as refunded_cents
    from refunds
    group by transaction_id
  ) r on r.transaction_id = t.id;

grant select on public.v_transactions_net to authenticated;

-- La vista es security_invoker: el LEFT JOIN a refunds aplica la RLS de
-- refunds del caller. La policy existente (refunds_club_staff, mig 179) solo
-- cubre staff de club → un PARTNER no vería los refunds y su neto no restaría
-- (silenciosamente incorrecto). Delegación: un refund es visible exactamente
-- cuando su transaction es visible para el caller (el EXISTS aplica la RLS de
-- transactions del usuario actual).
create policy refunds_tx_visible on public.refunds
  for select using (
    exists (select 1 from public.transactions t where t.id = transaction_id)
  );

comment on view public.v_transactions_net is
  'Fuente única de dinero reconocido: net_amount_cents = captured − refunds (parciales incluidos). Las superficies de revenue deben leer de aquí, no de transactions.status=captured.';

-- ── 2) Unificar ref_id de walk-ins ───────────────────────────────────────────
-- Online: ref_id = tournament_id + club_id. Walk-in: ref_id = registration.id
-- + club_id null → invisibles en finanzas del partner y fuera de payouts.
-- Backfill: re-apuntar al torneo. El vínculo por-inscripción sobrevive en
-- registrations.paid_transaction_id.
update public.transactions tx
   set ref_id = r.tournament_id,
       club_id = coalesce(tx.club_id, t.club_id)
  from public.registrations r
  join public.tournaments t on t.id = r.tournament_id
 where tx.kind = 'tournament'
   and tx.ref_id = r.id;

-- ── 3) Payouts reconciliables ────────────────────────────────────────────────
-- gross(periodo) = capturado en el periodo − refunds REGISTRADOS en el
-- periodo (aunque la tx sea de un periodo anterior). Así un refund marcado
-- después de generado un payout se descuenta automáticamente del payout del
-- periodo siguiente. Si el neto del periodo es <= 0 se omite el payout (la
-- deuda no se arrastra — límite conocido, aceptado para beta).
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
  _refunds_cents bigint;
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

    -- Refunds registrados EN el periodo (reconciliación de periodos previos
    -- incluida: si el refund llegó después del payout anterior, se descuenta
    -- aquí).
    select coalesce(sum(rf.amount_cents), 0)
    into _refunds_cents
    from refunds rf
    join transactions tx on tx.id = rf.transaction_id
    where tx.club_id = _club.id
      and rf.created_at >= _period_start
      and rf.created_at < _period_end_exclusive;

    _gross_cents := _gross_cents - _refunds_cents;

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
