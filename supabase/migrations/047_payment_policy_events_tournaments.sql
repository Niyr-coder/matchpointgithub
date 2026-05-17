-- 047 · Politica de pago por evento/torneo.
--
-- Hasta ahora la inscripcion asumia que precio > 0 implicaba pago previo
-- obligatorio. Algunos eventos cobran en sitio (cash/transfer en mostrador
-- el dia del evento), otros permiten que el usuario elija al inscribirse.
--
-- Enum `mp_event_payment_policy`:
--   free      → sin cobro. Solo valido si price_cents=0.
--   prepay    → debe pagar antes (sube comprobante). Flujo actual.
--   onsite    → paga en sitio. Inscripcion 'registered' inmediato; admin
--               marca la transaction 'captured' al cobrar en mostrador.
--   flexible  → el usuario elige al inscribirse entre online (prepay) y
--               onsite. La accion registerToEvent/Tournament acepta un
--               paymentMode adicional cuando la policy es flexible.
--
-- CHECK: free iff sin precio. Eventos pagos pueden ser prepay/onsite/flexible.
-- Backfill: eventos existentes pagos -> 'prepay' (comportamiento actual);
--           gratis -> 'free'.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'mp_event_payment_policy') then
    create type mp_event_payment_policy as enum ('free', 'prepay', 'onsite', 'flexible');
  end if;
end $$;

alter table public.events
  add column if not exists payment_policy mp_event_payment_policy;

alter table public.tournaments
  add column if not exists payment_policy mp_event_payment_policy;

update public.events
  set payment_policy = case when price_cents = 0 then 'free'::mp_event_payment_policy
                            else 'prepay'::mp_event_payment_policy end
  where payment_policy is null;

update public.tournaments
  set payment_policy = case when entry_fee_cents = 0 then 'free'::mp_event_payment_policy
                            else 'prepay'::mp_event_payment_policy end
  where payment_policy is null;

alter table public.events
  alter column payment_policy set not null,
  alter column payment_policy set default 'prepay'::mp_event_payment_policy;

alter table public.tournaments
  alter column payment_policy set not null,
  alter column payment_policy set default 'prepay'::mp_event_payment_policy;

alter table public.events
  drop constraint if exists events_payment_policy_consistent;
alter table public.events
  add constraint events_payment_policy_consistent
  check ((price_cents = 0 and payment_policy = 'free')
      or (price_cents > 0 and payment_policy in ('prepay','onsite','flexible')));

alter table public.tournaments
  drop constraint if exists tournaments_payment_policy_consistent;
alter table public.tournaments
  add constraint tournaments_payment_policy_consistent
  check ((entry_fee_cents = 0 and payment_policy = 'free')
      or (entry_fee_cents > 0 and payment_policy in ('prepay','onsite','flexible')));
