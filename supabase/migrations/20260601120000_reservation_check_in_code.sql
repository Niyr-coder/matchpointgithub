-- Código de check-in por reserva (recepción: buscar / escanear QR).

alter table reservations
  add column if not exists check_in_code text;

comment on column reservations.check_in_code is
  'Código alfanumérico 6 chars, único por club; RV/WK en UI según source.';

create unique index if not exists idx_reservations_club_check_in_code
  on reservations (club_id, check_in_code)
  where check_in_code is not null and status not in ('cancelled');

create or replace function mp_generate_check_in_code()
returns text
language plpgsql
as $$
declare
  chars text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  result text := '';
  i int;
  pick int;
begin
  for i in 1..6 loop
    pick := 1 + floor(random() * length(chars))::int;
    result := result || substr(chars, pick, 1);
  end loop;
  return result;
end;
$$;

create or replace function trg_reservations_check_in_code()
returns trigger
language plpgsql
as $$
declare
  attempts int := 0;
  code text;
begin
  if new.check_in_code is not null and btrim(new.check_in_code) <> '' then
    new.check_in_code := upper(btrim(new.check_in_code));
    return new;
  end if;

  loop
    attempts := attempts + 1;
    code := mp_generate_check_in_code();
    exit when not exists (
      select 1
      from reservations r
      where r.club_id = new.club_id
        and r.check_in_code = code
        and r.status not in ('cancelled')
        and (tg_op = 'INSERT' or r.id <> new.id)
    );
    if attempts > 24 then
      raise exception 'CHECKIN_CODE.EXHAUSTED';
    end if;
  end loop;

  new.check_in_code := code;
  return new;
end;
$$;

drop trigger if exists tg_reservations_check_in_code on reservations;
create trigger tg_reservations_check_in_code
  before insert or update of check_in_code on reservations
  for each row
  execute function trg_reservations_check_in_code();

-- Backfill reservas activas sin código.
do $$
declare
  rec record;
  attempts int;
  code text;
begin
  for rec in
    select id, club_id
    from reservations
    where check_in_code is null
      and status not in ('cancelled')
  loop
    attempts := 0;
    loop
      attempts := attempts + 1;
      code := mp_generate_check_in_code();
      exit when not exists (
        select 1
        from reservations r
        where r.club_id = rec.club_id
          and r.check_in_code = code
          and r.status not in ('cancelled')
      );
      if attempts > 24 then
        raise exception 'CHECKIN_CODE.BACKFILL_EXHAUSTED for %', rec.id;
      end if;
    end loop;
    update reservations set check_in_code = code where id = rec.id;
  end loop;
end;
$$;

insert into notification_kinds (kind, description, allowed_roles, default_channels, category)
values (
  'reservation_checked_in',
  'Check-in registrado en recepción',
  array['user']::mp_role[],
  array['inapp']::mp_notification_channel[],
  'reservations'
)
on conflict (kind) do nothing;
