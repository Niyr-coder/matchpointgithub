-- 110 · Backfill welcome MATCHPOINT a users existentes
-- Los hooks de welcome se dispararon a partir de migration 104 — los
-- users creados antes no tienen DM con MATCHPOINT. Este script encola
-- un welcome_signup retroactivo para cada uno (que no lo tenga ya).
--
-- Idempotente: si ya hay un DM con el system user, se skipea.
-- Respeta el killswitch system_messages_enabled.

do $$
declare
  v_user record;
  v_first_name text;
begin
  for v_user in
    select p.id, p.display_name
    from public.profiles p
    where p.is_system = false
      and not exists (
        select 1 from public.conversations c
        join public.conversation_members cm on cm.conversation_id = c.id
        where c.kind = 'dm'
          and cm.user_id = p.id
          and exists (
            select 1 from public.conversation_members cm2
            join public.profiles p2 on p2.id = cm2.user_id
            where cm2.conversation_id = c.id and p2.is_system = true
          )
      )
  loop
    v_first_name := coalesce(nullif(split_part(v_user.display_name, ' ', 1), ''), 'jugador');
    perform fn_send_system_message(
      v_user.id,
      '¡Hola ' || v_first_name || '! Bienvenido a MatchPoint, la comunidad #1 de pickleball en Ecuador. Reserva canchas, juega torneos y sube tu MPR. Si tienes dudas, escríbenos por aquí.',
      jsonb_build_object('kind', 'welcome_signup', 'backfilled', true)
    );
  end loop;
end $$;
