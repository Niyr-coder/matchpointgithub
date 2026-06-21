-- Código de vinculación partner ↔ club (compartido por el club, no UUID).

alter table clubs
  add column if not exists partner_link_code text;

create or replace function gen_club_partner_link_code() returns text
language plpgsql
set search_path = public
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
begin
  for i in 1..8 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return 'CLB-' || substr(code, 1, 4) || '-' || substr(code, 5, 4);
end;
$$;

do $$
declare
  rec record;
  new_code text;
begin
  for rec in select id from clubs where partner_link_code is null loop
    loop
      new_code := gen_club_partner_link_code();
      exit when not exists (select 1 from clubs where partner_link_code = new_code);
    end loop;
    update clubs set partner_link_code = new_code where id = rec.id;
  end loop;
end;
$$;

alter table clubs alter column partner_link_code set not null;
alter table clubs alter column partner_link_code set default gen_club_partner_link_code();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clubs_partner_link_code_key') then
    alter table clubs add constraint clubs_partner_link_code_key unique (partner_link_code);
  end if;
end $$;
