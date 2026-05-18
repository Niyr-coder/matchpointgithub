-- La policy pm_partner_admin tenía un EXISTS inline contra la misma tabla
-- partner_members, causando infinite recursion en cada evaluación. Usamos
-- la función mp_is_partner_admin_of (SECURITY DEFINER) que evade RLS.
drop policy if exists pm_partner_admin on public.partner_members;
create policy pm_partner_admin on public.partner_members
  for all
  using (mp_is_partner_admin_of(partner_id))
  with check (mp_is_partner_admin_of(partner_id));
