-- 132 · Fix recursión RLS entre quedadas ↔ quedada_participants.
-- quedadas_select consultaba quedada_participants y las policies de éste
-- consultaban quedadas → "infinite recursion detected in policy". Se rompe con
-- helpers SECURITY DEFINER (leen la otra tabla SIN disparar su RLS).

create or replace function public.mp_is_quedada_member(p_quedada uuid, p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.quedada_participants
    where quedada_id = p_quedada and user_id = p_user
  );
$$;

create or replace function public.mp_quedada_creator(p_quedada uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select creator_id from public.quedadas where id = p_quedada;
$$;

create or replace function public.mp_quedada_is_open(p_quedada uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.quedadas where id = p_quedada and visibility = 'open');
$$;

-- Recrear policies usando los helpers (sin referencias cruzadas vía RLS).
drop policy if exists quedadas_select on public.quedadas;
create policy quedadas_select on public.quedadas for select using (
  visibility = 'open'
  or creator_id = auth.uid()
  or public.mp_is_quedada_member(id, auth.uid())
  or auth.jwt() ->> 'role' = 'admin'
);

drop policy if exists qp_select on public.quedada_participants;
create policy qp_select on public.quedada_participants for select using (
  user_id = auth.uid()
  or public.mp_quedada_creator(quedada_id) = auth.uid()
  or public.mp_quedada_is_open(quedada_id)
  or auth.jwt() ->> 'role' = 'admin'
);

drop policy if exists qp_insert on public.quedada_participants;
create policy qp_insert on public.quedada_participants for insert with check (
  user_id = auth.uid()
  or public.mp_quedada_creator(quedada_id) = auth.uid()
);

drop policy if exists qp_update on public.quedada_participants;
create policy qp_update on public.quedada_participants for update using (
  user_id = auth.uid()
  or public.mp_quedada_creator(quedada_id) = auth.uid()
  or auth.jwt() ->> 'role' = 'admin'
);

drop policy if exists qp_delete on public.quedada_participants;
create policy qp_delete on public.quedada_participants for delete using (
  user_id = auth.uid()
  or public.mp_quedada_creator(quedada_id) = auth.uid()
  or auth.jwt() ->> 'role' = 'admin'
);
