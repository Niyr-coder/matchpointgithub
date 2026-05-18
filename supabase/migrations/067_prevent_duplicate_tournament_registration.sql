-- Dedupe activos: si hay múltiples registrations activas del mismo player
-- en el mismo torneo, nos quedamos con la más antigua y marcamos el resto
-- como withdrawn. Luego instalamos el trigger que evita que vuelva a pasar.
with active as (
  select id, tournament_id, unnest(player_ids) as player_id, created_at
  from registrations
  where status not in ('withdrawn', 'rejected', 'cancelled')
),
dups as (
  select id from (
    select id,
           row_number() over (partition by tournament_id, player_id order by created_at asc) as rn
    from active
  ) s
  where s.rn > 1
)
update registrations set status = 'withdrawn' where id in (select id from dups);

create or replace function public.fn_prevent_duplicate_registration()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid;
  v_clash boolean;
begin
  if new.status in ('withdrawn', 'rejected', 'cancelled') then
    return new;
  end if;
  foreach v_uid in array new.player_ids loop
    select exists(
      select 1 from registrations r
      where r.tournament_id = new.tournament_id
        and r.id is distinct from new.id
        and v_uid = any (r.player_ids)
        and r.status not in ('withdrawn', 'rejected', 'cancelled')
    ) into v_clash;
    if v_clash then
      raise exception 'duplicate registration: player % already registered to tournament %', v_uid, new.tournament_id
        using errcode = '23505',
              hint = 'REGISTRATION_DUPLICATE';
    end if;
  end loop;
  return new;
end;
$function$;

drop trigger if exists tg_prevent_duplicate_registration on public.registrations;
create trigger tg_prevent_duplicate_registration
  before insert or update on public.registrations
  for each row execute function public.fn_prevent_duplicate_registration();
