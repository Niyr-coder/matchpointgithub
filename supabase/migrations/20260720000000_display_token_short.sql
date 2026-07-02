-- 20260720000000 · display_token corto (10 chars) en vez de UUID.
--
-- El link de la pantalla TV (tv.matchpoint.top/[slug]?k=<token>) a veces se
-- teclea a mano en el navegador de una TV: un UUID de 36 chars es tortura.
-- Un código de 10 chars sobre alfabeto sin ambiguos (sin 0/O/1/I/L) da
-- 31^10 ≈ 8·10^14 combinaciones — de sobra para un secreto rotable.
--
-- Se regeneran los tokens existentes (los actuales son de torneos de prueba;
-- los links UUID viejos quedan inválidos a propósito). La validación en
-- getTournamentLiveDisplay es igualdad de string: no cambia.

alter table public.tournaments
  alter column display_token type text using display_token::text;

comment on column public.tournaments.display_token is
  'Secreto del link de pantalla TV (10 chars, alfabeto sin ambiguos). Se genera/rota desde TournamentVenueDisplayPanel.';

do $$
declare
  r record;
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  tok text;
  i int;
begin
  for r in select id from public.tournaments where display_token is not null loop
    tok := '';
    for i in 1..10 loop
      tok := tok || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    update public.tournaments set display_token = tok where id = r.id;
  end loop;
end $$;
