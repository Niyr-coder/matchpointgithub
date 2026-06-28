-- auth.jwt() ->> 'role' siempre retorna 'authenticated' en Supabase, nunca 'admin'.
-- Las policies que usaban ese check bloqueaban el acceso admin silenciosamente.
-- Se reemplazan todas las ocurrencias por mp_is_admin() (helper SECURITY DEFINER
-- que verifica role_assignments.role = 'admin' con revoked_at IS NULL).

-- ── quedadas ─────────────────────────────────────────────────────────────────
-- quedadas_update / quedadas_delete: 131_quedadas.sql
drop policy if exists quedadas_update on public.quedadas;
create policy quedadas_update on public.quedadas
  for update using (creator_id = auth.uid() or public.mp_is_admin());

drop policy if exists quedadas_delete on public.quedadas;
create policy quedadas_delete on public.quedadas
  for delete using (creator_id = auth.uid() or public.mp_is_admin());

-- quedadas_select: 132_quedadas_rls_fix.sql
drop policy if exists quedadas_select on public.quedadas;
create policy quedadas_select on public.quedadas
  for select using (
    visibility = 'open'
    or creator_id = auth.uid()
    or public.mp_is_quedada_member(id, auth.uid())
    or public.mp_is_admin()
  );

-- ── quedada_reports ───────────────────────────────────────────────────────────
-- qr_admin: 131_quedadas.sql
drop policy if exists qr_admin on public.quedada_reports;
create policy qr_admin on public.quedada_reports
  for all using (public.mp_is_admin());

-- ── quedada_participants ──────────────────────────────────────────────────────
-- qp_select: 132_quedadas_rls_fix.sql
drop policy if exists qp_select on public.quedada_participants;
create policy qp_select on public.quedada_participants
  for select using (
    user_id = auth.uid()
    or public.mp_quedada_creator(quedada_id) = auth.uid()
    or public.mp_quedada_is_open(quedada_id)
    or public.mp_is_admin()
  );

-- qp_update: 133_quedadas_management.sql (última override)
drop policy if exists qp_update on public.quedada_participants;
create policy qp_update on public.quedada_participants
  for update using (
    user_id = auth.uid()
    or public.mp_quedada_can_manage(quedada_id, auth.uid())
    or public.mp_is_admin()
  );

-- qp_delete: 132_quedadas_rls_fix.sql
drop policy if exists qp_delete on public.quedada_participants;
create policy qp_delete on public.quedada_participants
  for delete using (
    user_id = auth.uid()
    or public.mp_quedada_creator(quedada_id) = auth.uid()
    or public.mp_is_admin()
  );

-- ── quedada_categories ────────────────────────────────────────────────────────
-- qc_select / qc_write: 133_quedadas_management.sql
drop policy if exists qc_select on public.quedada_categories;
create policy qc_select on public.quedada_categories
  for select using (
    public.mp_quedada_is_open(quedada_id)
    or public.mp_is_quedada_member(quedada_id, auth.uid())
    or public.mp_quedada_can_manage(quedada_id, auth.uid())
    or public.mp_is_admin()
  );

drop policy if exists qc_write on public.quedada_categories;
create policy qc_write on public.quedada_categories
  for all using (
    public.mp_quedada_creator(quedada_id) = auth.uid() or public.mp_is_admin()
  );

-- ── quedada_pairs ─────────────────────────────────────────────────────────────
-- qpair_select / qpair_write: 133_quedadas_management.sql
drop policy if exists qpair_select on public.quedada_pairs;
create policy qpair_select on public.quedada_pairs
  for select using (
    public.mp_quedada_is_open(quedada_id)
    or public.mp_is_quedada_member(quedada_id, auth.uid())
    or public.mp_quedada_can_manage(quedada_id, auth.uid())
    or public.mp_is_admin()
  );

drop policy if exists qpair_write on public.quedada_pairs;
create policy qpair_write on public.quedada_pairs
  for all using (
    public.mp_quedada_can_manage(quedada_id, auth.uid()) or public.mp_is_admin()
  );

-- ── quedada_cohosts ───────────────────────────────────────────────────────────
-- qch_select / qch_write: 133_quedadas_management.sql
drop policy if exists qch_select on public.quedada_cohosts;
create policy qch_select on public.quedada_cohosts
  for select using (
    public.mp_quedada_is_open(quedada_id)
    or public.mp_is_quedada_member(quedada_id, auth.uid())
    or public.mp_quedada_can_manage(quedada_id, auth.uid())
    or public.mp_is_admin()
  );

drop policy if exists qch_write on public.quedada_cohosts;
create policy qch_write on public.quedada_cohosts
  for all using (
    public.mp_quedada_creator(quedada_id) = auth.uid() or public.mp_is_admin()
  );

-- ── quedada_rounds ────────────────────────────────────────────────────────────
-- qr_round_select / qr_round_write: 141_quedada_engine_redesign.sql
drop policy if exists qr_round_select on public.quedada_rounds;
create policy qr_round_select on public.quedada_rounds
  for select using (
    public.mp_quedada_is_open(quedada_id)
    or public.mp_is_quedada_member(quedada_id, auth.uid())
    or public.mp_quedada_can_manage(quedada_id, auth.uid())
    or public.mp_is_admin()
  );

drop policy if exists qr_round_write on public.quedada_rounds;
create policy qr_round_write on public.quedada_rounds
  for all
  using (public.mp_quedada_can_manage(quedada_id, auth.uid()) or public.mp_is_admin())
  with check (public.mp_quedada_can_manage(quedada_id, auth.uid()) or public.mp_is_admin());

-- ── quedada_games ─────────────────────────────────────────────────────────────
-- qg_select / qg_write: 141_quedada_engine_redesign.sql
drop policy if exists qg_select on public.quedada_games;
create policy qg_select on public.quedada_games
  for select using (
    public.mp_quedada_is_open(quedada_id)
    or public.mp_is_quedada_member(quedada_id, auth.uid())
    or public.mp_quedada_can_manage(quedada_id, auth.uid())
    or public.mp_is_admin()
  );

drop policy if exists qg_write on public.quedada_games;
create policy qg_write on public.quedada_games
  for all
  using (public.mp_quedada_can_manage(quedada_id, auth.uid()) or public.mp_is_admin())
  with check (public.mp_quedada_can_manage(quedada_id, auth.uid()) or public.mp_is_admin());

-- ── cosmetic_bundles ──────────────────────────────────────────────────────────
-- cb_public_select / cb_admin_write: 114_cosmetic_bundles.sql
drop policy if exists cb_public_select on public.cosmetic_bundles;
create policy cb_public_select on public.cosmetic_bundles
  for select using (active = true or public.mp_is_admin());

drop policy if exists cb_admin_write on public.cosmetic_bundles;
create policy cb_admin_write on public.cosmetic_bundles
  for all using (public.mp_is_admin());

-- ── profile_cosmetic_grants ───────────────────────────────────────────────────
-- pcg_admin_all: 114_cosmetic_bundles.sql
drop policy if exists pcg_admin_all on public.profile_cosmetic_grants;
create policy pcg_admin_all on public.profile_cosmetic_grants
  for all using (public.mp_is_admin());

-- ── theme_settings ────────────────────────────────────────────────────────────
-- ts_admin_write: 129_theme_settings.sql
drop policy if exists ts_admin_write on public.theme_settings;
create policy ts_admin_write on public.theme_settings
  for all using (public.mp_is_admin());
