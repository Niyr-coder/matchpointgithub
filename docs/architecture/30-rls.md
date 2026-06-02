# 30 · Row-Level Security policies

> Matriz **rol × tabla** con las políticas exactas. Todas las tablas con datos tenant nacen con `enable row level security` + al menos `select`/`insert`/`update`/`delete` definidos. Lo que **no** está cubierto por una policy, **se deniega por default**.

---

## 1. Helpers Postgres (re-usables en todas las policies)

```sql
-- ¿La sesión tiene acceso al club con cierto rol?
create or replace function auth.has_club_access(p_club_id uuid, p_role mp_role default null)
returns boolean language sql stable as $$
  select exists(
    select 1 from role_assignments ra
    where ra.user_id = auth.uid()
      and ra.club_id = p_club_id
      and (p_role is null or ra.role = p_role)
      and ra.revoked_at is null
  );
$$;

-- Atajos por rol específico
create or replace function auth.is_admin() returns boolean
language sql stable as $$
  select exists(select 1 from role_assignments where user_id=auth.uid() and role='admin' and revoked_at is null);
$$;

create or replace function auth.is_owner_of(p_club_id uuid) returns boolean
language sql stable as $$ select auth.has_club_access(p_club_id, 'owner'); $$;

create or replace function auth.is_manager_of(p_club_id uuid) returns boolean
language sql stable as $$ select auth.has_club_access(p_club_id, 'manager'); $$;

create or replace function auth.is_employee_of(p_club_id uuid) returns boolean
language sql stable as $$ select auth.has_club_access(p_club_id, 'employee'); $$;

create or replace function auth.is_coach_in(p_club_id uuid) returns boolean
language sql stable as $$ select auth.has_club_access(p_club_id, 'coach'); $$;

create or replace function auth.club_staff(p_club_id uuid) returns boolean
language sql stable as $$
  select auth.is_admin()
      or auth.is_owner_of(p_club_id)
      or auth.is_manager_of(p_club_id);
$$;

-- Rol activo. Nota app: hoy Supabase JS/PostgREST no setea este GUC de forma
-- global por request; usarlo solo en tests/RPCs que hagan SET LOCAL dentro de
-- la misma transacción.
create or replace function auth.active_role() returns mp_role
language sql stable as $$
  select nullif(current_setting('app.active_role', true), '')::mp_role
$$;

create or replace function auth.active_club_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.active_club_id', true), '')::uuid
$$;

-- ¿El user es partner cuyos clubes incluyen este club_id?
create or replace function auth.partner_has_club(p_club_id uuid) returns boolean
language sql stable as $$
  select exists(
    select 1 from partner_club_links pcl
    join partner_members pm on pm.partner_id = pcl.partner_id
    where pcl.club_id = p_club_id and pm.user_id = auth.uid()
  );
$$;
```

---

## 2. Matriz general (lectura horizontal)

| Tabla / dominio | admin | partner | owner | manager | coach | employee | user (target) | anon |
|---|---|---|---|---|---|---|---|---|
| `profiles` (self) | r/w | r/w | r/w | r/w | r/w | r/w | r/w | r de campos públicos |
| `profiles` (otros) | r/w | r limited | r limited | r limited | r limited | r limited | r limited | r public |
| `role_assignments` | r/w | r self | r self+club | r self | r self | r self | r self | – |
| `clubs` | r/w | r owned | r/w own | r/w own | r own | r own | r public | r public |
| `club_applications` | r/w | – | – | – | – | – | r/w own | – |
| `courts` | r/w | r owned | r/w own | r/w own | r own | r own | r public | r public |
| `reservations` | r/w | r owned | r/w own | r/w own | r own | r/w own | r/w own | – |
| `cash_*` | r aggregated | r aggregated | r/w own | r/w own | r own (cobro) | r/w own | – | – |
| `proshop products` | r/w | r owned | r/w own | r/w own | r own | r own | r public | r public |
| `proshop sales/carts` | r aggregated | r owned | r/w own | r/w own | – | r/w own | r own (cart) | – |
| `coach_*` | r/w | r owned-club | r own-club | r own-club | r/w self | r own-club | r public | r public |
| `classes`, `class_sessions` | r/w | r owned-club | r/w own | r/w own | r/w own (as coach) | r own | r/w enrollment | r catalog |
| `students/*` (progress/notes/evals) | r/w | – | – | – | r/w own students | – | r self | – |
| `resources` | r/w | – | – | – | r/w own | – | r if granted | – |
| `messaging *` | r/w (mod) | r own | r own | r own | r own | r own | r/w own | – |
| `friends/teams/blocks` | r/w (mod) | r self | r self | r self | r self | r self | r/w self | – |
| `ranking/match_results` | r/w | r | r | r | r | r | r public · w own | r public |
| `tournaments/*` | r/w | r/w own | r club-host | r club-host | r | r | r public · w register | r public |
| `events` | r/w | r/w own | r/w own | r/w own | r | r | r/w register | r public |
| `notifications` (recipient) | r self | r self | r self | r self | r self | r self | r/w self (read/preferences) | – |
| `broadcasts` | r/w | r/w own | r/w own | r/w own | – | – | – | – |
| `reports` | r/w | – | r own-club | r own-club | – | – | r/w self submissions | – |
| `audit_log` | r | – | r own-club | r own-club | – | – | – | – |
| `tickets` | r/w | r own | r/w own-club | r/w own-club | – | r own-club + w self/asignado | r/w self | – |
| `feature_flags` | r/w | – | – | – | – | – | r effective | – |
| `help_*` | r/w | r published | r published | r published | r published | r published | r published + feedback/log own | – |
| `partner_*` | r/w | r/w own | – | – | – | – | – | – |

> `r limited` = solo columnas públicas + columnas necesarias para el contexto (ej. ver nombre de jugador de un partido). Se logra con **vistas** o **column-level masking** (no nativo en Supabase, así que vamos por vistas).

---

## 3. Plantillas comunes

Tres patrones cubren ~80% de las tablas. Cualquier tabla nueva debe encajar en uno.

### 3.1 Patrón "tenant-scoped" (tiene `club_id`)

```sql
-- Ejemplo: courts
alter table courts enable row level security;

create policy courts_public_select on courts for select
  using ( true );  -- canchas son públicas para lectura (catálogo)

create policy courts_staff_insert on courts for insert
  with check ( auth.club_staff(club_id) );

create policy courts_staff_update on courts for update
  using ( auth.club_staff(club_id) )
  with check ( auth.club_staff(club_id) );

create policy courts_staff_delete on courts for delete
  using ( auth.club_staff(club_id) );
```

### 3.2 Patrón "self-scoped" (tiene `user_id`)

```sql
-- Ejemplo: notification_preferences
alter table notification_preferences enable row level security;

create policy nprefs_self_all on notification_preferences for all
  using ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );
```

### 3.3 Patrón "membership-scoped" (M:N a través de tabla puente)

```sql
-- Ejemplo: messages (visible si soy miembro del conversation)
alter table messages enable row level security;

create policy messages_member_select on messages for select
  using (
    exists(
      select 1 from conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id = auth.uid()
        and cm.left_at is null
    )
  );

create policy messages_member_insert on messages for insert
  with check (
    sender_id = auth.uid()
    and exists(
      select 1 from conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id = auth.uid()
        and cm.left_at is null
    )
  );

create policy messages_owner_update on messages for update
  using ( sender_id = auth.uid() and created_at > now() - interval '15 min' );

create policy messages_owner_delete on messages for delete
  using ( sender_id = auth.uid() );

create policy messages_admin_all on messages for all
  using ( auth.is_admin() );
```

---

## 4. Políticas por dominio

A continuación, las policies completas para las tablas más sensibles (las demás siguen las 3 plantillas).

### 4.1 identity

```sql
-- profiles: público lee campos públicos vía vista; tabla raw solo self + staff
alter table profiles enable row level security;

create policy profiles_self on profiles for all
  using ( id = auth.uid() ) with check ( id = auth.uid() );

create policy profiles_admin on profiles for all
  using ( auth.is_admin() );

-- Vista pública (no RLS aquí, se sirve a anon)
create view v_public_profiles as
  select id, username, display_name, avatar_url, city, country,
         preferred_sport, skill_level, created_at
  from profiles;
grant select on v_public_profiles to anon, authenticated;

-- role_assignments
alter table role_assignments enable row level security;

create policy ra_self_select on role_assignments for select
  using ( user_id = auth.uid() );

create policy ra_admin_all on role_assignments for all
  using ( auth.is_admin() );

create policy ra_owner_select_club on role_assignments for select
  using ( club_id is not null and auth.is_owner_of(club_id) );

create policy ra_owner_grant_staff on role_assignments for insert
  with check (
    club_id is not null and auth.is_owner_of(club_id)
    and role in ('manager','coach','employee')
  );

create policy ra_owner_revoke_staff on role_assignments for update
  using (
    club_id is not null and auth.is_owner_of(club_id)
    and role in ('manager','coach','employee')
  );
```

### 4.2 clubs + club_applications

```sql
alter table clubs enable row level security;

create policy clubs_public_select on clubs for select using ( status='active' );
create policy clubs_staff_select on clubs for select using ( auth.club_staff(id) );
create policy clubs_admin_all on clubs for all using ( auth.is_admin() );
create policy clubs_owner_update on clubs for update
  using ( auth.is_owner_of(id) ) with check ( auth.is_owner_of(id) );

alter table club_settings enable row level security;
create policy club_settings_staff_all on club_settings for all
  using ( auth.club_staff(club_id) );

-- Sub-dominio applications
alter table club_applications enable row level security;

create policy app_applicant_all on club_applications for all
  using ( applicant_id = auth.uid() )
  with check ( applicant_id = auth.uid() and status in ('draft','submitted','withdrawn') );

create policy app_admin_all on club_applications for all
  using ( auth.is_admin() );

-- Solo admin puede mover entre estados de revisión
create policy app_admin_status_transitions on club_applications for update
  using ( auth.is_admin() )
  with check ( auth.is_admin() );

alter table club_application_documents enable row level security;
create policy app_docs_applicant on club_application_documents for all
  using ( exists(select 1 from club_applications a where a.id=application_id and a.applicant_id=auth.uid()) );
create policy app_docs_admin on club_application_documents for all
  using ( auth.is_admin() );

alter table club_application_courts enable row level security;
create policy app_courts_applicant on club_application_courts for all
  using ( exists(select 1 from club_applications a where a.id=application_id and a.applicant_id=auth.uid()) );
create policy app_courts_admin on club_application_courts for all using ( auth.is_admin() );

alter table club_application_photos enable row level security;
create policy app_photos_applicant on club_application_photos for all
  using ( exists(select 1 from club_applications a where a.id=application_id and a.applicant_id=auth.uid()) );
create policy app_photos_admin on club_application_photos for all using ( auth.is_admin() );

alter table club_application_events enable row level security;
create policy app_events_visible on club_application_events for select
  using (
    auth.is_admin()
    or exists(select 1 from club_applications a where a.id=application_id and a.applicant_id=auth.uid())
  );
-- escritura solo vía SECURITY DEFINER functions
```

### 4.3 courts (patrón 3.1)

```sql
alter table courts enable row level security;
create policy courts_public_select on courts for select using ( true );
create policy courts_staff_write on courts for all
  using ( auth.club_staff(club_id) ) with check ( auth.club_staff(club_id) );

alter table court_pricing enable row level security;
create policy cp_public_select on court_pricing for select using ( true );
create policy cp_staff_write on court_pricing for all
  using ( exists(select 1 from courts c where c.id=court_id and auth.club_staff(c.club_id)) );

alter table court_blocks enable row level security;
create policy cb_public_select on court_blocks for select using ( true );
create policy cb_staff_write on court_blocks for all
  using ( exists(select 1 from courts c where c.id=court_id and auth.club_staff(c.club_id)) );
```

### 4.4 reservations

```sql
alter table reservations enable row level security;

-- Lectura: organizador, participantes, staff del club, o si visibility='public'
create policy res_select on reservations for select
  using (
    organizer_id = auth.uid()
    or visibility = 'public'
    or auth.club_staff(club_id)
    or auth.is_employee_of(club_id)
    or exists(select 1 from reservation_participants p
              where p.reservation_id = reservations.id and p.user_id = auth.uid())
  );

-- Crear: cualquier user autenticado, pero organizer_id = self
create policy res_insert_user on reservations for insert
  with check ( organizer_id = auth.uid() and source = 'app' );

-- Crear walkin/admin: solo staff
create policy res_insert_staff on reservations for insert
  with check ( auth.club_staff(club_id) or auth.is_employee_of(club_id) );

-- Update: organizador (solo si booked/confirmed) o staff
create policy res_update on reservations for update
  using (
    (organizer_id = auth.uid() and status in ('booked','confirmed'))
    or auth.club_staff(club_id)
    or auth.is_employee_of(club_id)
  );

-- Cancel/delete: organizer puede cancel; delete real solo admin
create policy res_delete_admin on reservations for delete using ( auth.is_admin() );

alter table reservation_participants enable row level security;
create policy rp_select on reservation_participants for select
  using (
    user_id = auth.uid()
    or exists(select 1 from reservations r
              where r.id=reservation_id and (r.organizer_id=auth.uid() or auth.club_staff(r.club_id)))
  );
create policy rp_join_self on reservation_participants for insert
  with check (
    user_id = auth.uid()
    and exists(select 1 from reservations r where r.id=reservation_id and r.visibility='public')
  );
create policy rp_organizer_invite on reservation_participants for insert
  with check ( exists(select 1 from reservations r where r.id=reservation_id and r.organizer_id=auth.uid()) );
create policy rp_leave on reservation_participants for delete
  using ( user_id = auth.uid() );
```

### 4.5 cash

```sql
-- Caja: solo staff del club
alter table cash_sessions enable row level security;
create policy cash_staff on cash_sessions for all
  using ( auth.club_staff(club_id) or auth.is_employee_of(club_id) )
  with check ( auth.club_staff(club_id) or auth.is_employee_of(club_id) );

alter table transactions enable row level security;
-- Owner/manager/admin: lectura + mutación financiera del club.
create policy tx_club_staff_select on transactions for select
  using (club_id is not null and auth.club_staff(club_id));
create policy tx_club_staff_insert on transactions for insert
  with check (club_id is not null and auth.club_staff(club_id));
create policy tx_club_staff_update on transactions for update
  using (club_id is not null and auth.club_staff(club_id))
  with check (club_id is not null and auth.club_staff(club_id));

-- Employee: puede leer el club y crear cobros esperados por flujos de caja/shop,
-- pero no actualizar/refundear transacciones arbitrarias.
create policy tx_employee_select on transactions for select
  using (club_id is not null and auth.is_employee_of(club_id));
create policy tx_employee_insert on transactions for insert
  with check (
    club_id is not null
    and auth.is_employee_of(club_id)
    and created_by = auth.uid()
    and kind in ('reservation', 'proshop_sale', 'custom')
  );

-- El customer puede ver sus propias transacciones
create policy tx_customer_select on transactions for select
  using ( customer_user_id = auth.uid() );

-- Coach ve transacciones de sus clases (lectura)
create policy tx_coach_select_classes on transactions for select
  using (
    kind = 'class' and exists(
      select 1 from class_enrollments ce
      join classes c on c.id = ce.class_id
      where ce.paid_transaction_id = transactions.id
        and c.coach_id = auth.uid()
    )
  );

alter table refunds enable row level security;
create policy refunds_club_staff on refunds for all
  using ( exists(select 1 from transactions t where t.id=transaction_id
                 and auth.club_staff(t.club_id)) )
  with check ( exists(select 1 from transactions t where t.id=transaction_id
                      and auth.club_staff(t.club_id)) );
```

### 4.6 proshop

```sql
alter table products enable row level security;
create policy products_public_select on products for select using ( active );
create policy products_staff_write on products for all
  using ( club_id is null or auth.club_staff(club_id) )
  with check ( club_id is null or auth.club_staff(club_id) );

alter table carts enable row level security;
create policy carts_self on carts for all using ( user_id = auth.uid() );

alter table cart_items enable row level security;
create policy cart_items_self on cart_items for all
  using ( exists(select 1 from carts c where c.id=cart_id and c.user_id=auth.uid()) );

alter table sales enable row level security;
create policy sales_staff_all on sales for all
  using ( auth.club_staff(club_id) or auth.is_employee_of(club_id) );
create policy sales_customer_select on sales for select
  using ( customer_user_id = auth.uid() );
```

### 4.7 coaches + classes

```sql
alter table coach_profiles enable row level security;
create policy coach_public_select on coach_profiles for select using ( true );
create policy coach_self_write on coach_profiles for all
  using ( id = auth.uid() ) with check ( id = auth.uid() );
create policy coach_admin_all on coach_profiles for all using ( auth.is_admin() );

alter table classes enable row level security;
create policy classes_public_select on classes for select using ( active );
create policy classes_coach_write on classes for all
  using ( coach_id = auth.uid() ) with check ( coach_id = auth.uid() );
create policy classes_staff_write on classes for all
  using ( auth.club_staff(club_id) ) with check ( auth.club_staff(club_id) );

alter table class_enrollments enable row level security;
create policy ce_student_self on class_enrollments for select using ( student_id = auth.uid() );
create policy ce_student_enroll on class_enrollments for insert with check ( student_id = auth.uid() );
create policy ce_student_cancel on class_enrollments for update
  using ( student_id = auth.uid() and status in ('enrolled','waitlist') );
create policy ce_coach_select on class_enrollments for select
  using ( exists(select 1 from classes c where c.id=class_id and c.coach_id=auth.uid()) );

alter table lessons_1on1 enable row level security;
create policy l1_visible on lessons_1on1 for select
  using ( coach_id = auth.uid() or student_id = auth.uid() or auth.club_staff(club_id) );
create policy l1_student_book on lessons_1on1 for insert
  with check ( student_id = auth.uid() );
create policy l1_coach_update on lessons_1on1 for update
  using ( coach_id = auth.uid() or student_id = auth.uid() );
```

### 4.8 students (privacidad fuerte)

```sql
alter table student_progress enable row level security;
create policy sp_student_self on student_progress for select using ( student_id = auth.uid() );
create policy sp_coach_write on student_progress for all
  using ( coach_id = auth.uid() ) with check ( coach_id = auth.uid() );

alter table student_evaluations enable row level security;
create policy se_student_self on student_evaluations for select using ( student_id = auth.uid() );
create policy se_coach_write on student_evaluations for all using ( coach_id = auth.uid() );

alter table student_notes enable row level security;
-- visibility='coach' (privada) o 'shared'
create policy sn_coach_all on student_notes for all using ( coach_id = auth.uid() );
create policy sn_student_shared on student_notes for select
  using ( student_id = auth.uid() and visibility = 'shared' );
```

### 4.9 resources

```sql
alter table resources enable row level security;
create policy resources_coach_write on resources for all
  using ( coach_id = auth.uid() ) with check ( coach_id = auth.uid() );

create policy resources_public_select on resources for select using ( visibility = 'public' );

create policy resources_shared_select on resources for select
  using (
    exists(
      select 1 from resource_access ra
      where ra.resource_id = resources.id
        and ( ra.user_id = auth.uid()
              or exists(select 1 from class_enrollments ce
                        where ce.class_id = ra.class_id
                          and ce.student_id = auth.uid()
                          and ce.status = 'enrolled') )
    )
  );

alter table resource_files enable row level security;
create policy rf_visible on resource_files for select
  using ( exists(select 1 from resources r where r.id=resource_id and (
    r.coach_id = auth.uid()
    or r.visibility = 'public'
    or exists(select 1 from resource_access ra where ra.resource_id=r.id and ra.user_id=auth.uid())
  )));
```

### 4.10 messaging — patrón 3.3 (ya visto arriba)

```sql
-- Helpers anti-recursión: las policies de mensajería no consultan
-- conversation_members inline desde otra policy sobre conversation_members.
create or replace function public.mp_is_conversation_member(
  p_conversation uuid,
  p_user uuid,
  p_active_only boolean default false
)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation
      and cm.user_id = p_user
      and (not p_active_only or cm.left_at is null)
  );
$$;

create or replace function public.mp_is_conversation_admin(p_conversation uuid, p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation
      and cm.user_id = p_user
      and cm.role = 'admin'
      and cm.left_at is null
  );
$$;

alter table conversations enable row level security;
create policy conv_member_select on conversations for select
  using ( public.mp_is_conversation_member(id, auth.uid(), true) );
create policy conv_creator_insert on conversations for insert with check ( created_by = auth.uid() );

alter table conversation_members enable row level security;
create policy cm_self_select on conversation_members for select using ( user_id = auth.uid() );
create policy cm_member_select on conversation_members for select
  using ( public.mp_is_conversation_member(conversation_id, auth.uid(), false) );
create policy cm_admin_invite on conversation_members for insert
  with check ( public.mp_is_conversation_admin(conversation_id, auth.uid()) );

-- messages: ya está arriba como patrón 3.3
```

### 4.11 friends / blocks

```sql
alter table friend_requests enable row level security;
create policy fr_self_visible on friend_requests for select
  using ( from_user_id = auth.uid() or to_user_id = auth.uid() );
create policy fr_send on friend_requests for insert with check ( from_user_id = auth.uid() );
create policy fr_respond on friend_requests for update using ( to_user_id = auth.uid() );
-- Migration 20260602120000: reabrir solicitud propia tras accepted/rejected/cancelled.
create policy fr_sender_reopen on friend_requests for update
  to authenticated
  using ( from_user_id = auth.uid() and status in ('accepted','rejected','cancelled') )
  with check ( from_user_id = auth.uid() and status = 'pending' );

alter table friendships enable row level security;
create policy friendships_self on friendships for select
  using ( user_a = auth.uid() or user_b = auth.uid() );
create policy friendships_delete_self on friendships for delete
  using ( user_a = auth.uid() or user_b = auth.uid() );
-- Migration 20260601180000: el destinatario inserta al aceptar (pending o
-- accepted sin fila — reparación de aceptaciones previas sin friendship).
create policy friendships_insert_pending_accept on friendships for insert
  to authenticated
  with check (
    auth.uid() in (user_a, user_b)
    and user_a < user_b
    and exists (
      select 1 from friend_requests fr
      where fr.to_user_id = auth.uid()
        and fr.from_user_id in (user_a, user_b)
        and fr.to_user_id in (user_a, user_b)
        and fr.status in ('pending', 'accepted')
    )
  );

alter table blocks enable row level security;
create policy blocks_self on blocks for all using ( blocker_id = auth.uid() );
```

### 4.12 teams

```sql
alter table teams enable row level security;
create policy teams_public_select on teams for select using ( true );
create policy teams_captain_write on teams for all
  using ( captain_id = auth.uid() ) with check ( captain_id = auth.uid() );

alter table team_members enable row level security;
create policy tm_visible on team_members for select using ( true );
create policy tm_captain_manage on team_members for all
  using ( exists(select 1 from teams t where t.id=team_id and t.captain_id=auth.uid()) );
create policy tm_self_leave on team_members for delete using ( user_id = auth.uid() );

alter table team_invites enable row level security;
create policy ti_visible on team_invites for select
  using ( invited_user_id = auth.uid()
       or exists(select 1 from teams t where t.id=team_id and t.captain_id=auth.uid()) );
create policy ti_send on team_invites for insert
  with check ( exists(select 1 from teams t where t.id=team_id and t.captain_id=auth.uid()) );
create policy ti_respond on team_invites for update using ( invited_user_id = auth.uid() );
-- Migration 036: el captain puede UPDATE invites para cancelarlas.
create policy ti_captain_manage on team_invites for update
  using ( exists(select 1 from teams t where t.id=team_id and t.captain_id=auth.uid()) );
```

### 4.12.b teams · join requests (migration 037)

```sql
alter table team_join_requests enable row level security;
-- User ve sus propias; captain ve las del team que dirige.
create policy tjr_visible on team_join_requests for select using (
  user_id = auth.uid()
  or exists(select 1 from teams t where t.id=team_id and t.captain_id=auth.uid())
);
-- User crea solo para sí mismo y solo si el team NO es private.
create policy tjr_user_create on team_join_requests for insert with check (
  user_id = auth.uid()
  and exists(select 1 from teams t where t.id=team_id and coalesce(t.privacy,'public') in ('public','invite'))
);
-- User puede borrar / actualizar la propia (cancelar).
create policy tjr_user_cancel on team_join_requests for delete using ( user_id = auth.uid() );
create policy tjr_user_update_self on team_join_requests for update using ( user_id = auth.uid() );
-- Captain aprueba / rechaza.
create policy tjr_captain_respond on team_join_requests for update
  using ( exists(select 1 from teams t where t.id=team_id and t.captain_id=auth.uid()) );
```

**Por qué `transfer_team_captain` usa SECURITY DEFINER:** la policy `teams_captain_write` exige `WITH CHECK (captain_id = auth.uid())`. Un UPDATE que cambia `captain_id` a otro user falla porque el nuevo valor no coincide con `auth.uid()`. La función bypassea RLS y valida explícitamente que `auth.uid()` es el captain actual.

### 4.13 ranking / match_results

```sql
alter table match_results enable row level security;
-- Lectura: pública para resultados confirmados; restringida si están en disputa
create policy mr_confirmed_public on match_results for select using ( status = 'confirmed' );
create policy mr_involved_select on match_results for select
  using (
    reported_by = auth.uid()
    or side_a @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
    or side_b @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
  );
create policy mr_report on match_results for insert with check ( reported_by = auth.uid() );
create policy mr_confirm on match_results for update
  using (
    side_a @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
    or side_b @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
    or auth.is_admin()
  );

alter table player_stats enable row level security;
create policy ps_public_select on player_stats for select using ( true );
-- escritura solo desde funciones SECURITY DEFINER (recálculo)

alter table ranking_snapshots enable row level security;
create policy rs_public_select on ranking_snapshots for select using ( true );
```

### 4.14 tournaments / brackets

```sql
alter table tournaments enable row level security;
create policy t_public_select on tournaments for select
  using ( status not in ('draft','cancelled') );
create policy t_partner_write on tournaments for all
  using ( partner_id is not null and exists(
            select 1 from partner_members pm where pm.partner_id=tournaments.partner_id
              and pm.user_id=auth.uid() and pm.role in ('owner','admin')) );
create policy t_admin_all on tournaments for all using ( auth.is_admin() );

alter table registrations enable row level security;
create policy reg_visible on registrations for select
  using (
    registered_by = auth.uid()
    or auth.uid() = any(player_ids)
    or exists(select 1 from tournaments t join partner_members pm on pm.partner_id=t.partner_id
              where t.id=tournament_id and pm.user_id=auth.uid())
    or auth.is_admin()
  );
create policy reg_self_register on registrations for insert
  with check ( registered_by = auth.uid() and auth.uid() = any(player_ids) );
create policy reg_self_withdraw on registrations for update
  using ( registered_by = auth.uid() and status in ('pending','accepted') );

alter table brackets enable row level security;
create policy br_public_select on brackets for select using ( true );
create policy br_partner_write on brackets for all
  using ( exists(select 1 from tournaments t where t.id=tournament_id
                 and exists(select 1 from partner_members pm
                            where pm.partner_id=t.partner_id and pm.user_id=auth.uid()
                              and pm.role in ('owner','admin'))) );

alter table bracket_matches enable row level security;
create policy bm_public_select on bracket_matches for select using ( true );
create policy bm_partner_write on bracket_matches for all
  using ( exists(select 1 from brackets b join tournaments t on t.id=b.tournament_id
                 where b.id=bracket_id
                   and exists(select 1 from partner_members pm
                              where pm.partner_id=t.partner_id and pm.user_id=auth.uid()
                                and pm.role in ('owner','admin'))) );
create policy bm_player_report_score on bracket_matches for update
  using (
    exists(select 1 from registrations r
           where r.id in (side_a_registration_id, side_b_registration_id)
             and auth.uid() = any(r.player_ids))
  );
```

### 4.15 events

```sql
alter table events enable row level security;
create policy events_public_select on events for select
  using ( visibility = 'public' and status in ('published','registration_open','registration_closed','live','finished') );
create policy events_member_select on events for select
  using ( visibility = 'members' and (auth.uid() is not null) );
create policy events_organizer_all on events for all
  using ( organizer_id = auth.uid()
       or (club_id is not null and auth.club_staff(club_id)) );

alter table event_registrations enable row level security;
create policy er_self on event_registrations for all using ( user_id = auth.uid() );
create policy er_organizer_select on event_registrations for select
  using ( exists(select 1 from events e where e.id=event_id and
                 (e.organizer_id=auth.uid() or (e.club_id is not null and auth.club_staff(e.club_id)))) );
```

### 4.16 notifications (role-aware)

```sql
alter table notifications enable row level security;

-- El usuario solo ve notifs de su rol activo
create policy notif_self_active_role on notifications for select
  using (
    recipient_user_id = auth.uid()
    and recipient_role = auth.active_role()
  );

create policy notif_mark_read on notifications for update
  using ( recipient_user_id = auth.uid() and recipient_role = auth.active_role() )
  with check ( recipient_user_id = auth.uid() );

-- INSERT solo desde funciones SECURITY DEFINER (enqueue_notification)
revoke insert on notifications from authenticated, anon;

alter table notification_preferences enable row level security;
create policy nprefs_self on notification_preferences for all
  using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );

alter table notification_subscriptions enable row level security;
create policy nsubs_self on notification_subscriptions for all
  using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );

alter table notification_kinds enable row level security;
create policy nkinds_public_select on notification_kinds for select using ( true );

alter table notification_jobs enable row level security;
create policy njobs_admin_all on notification_jobs for all using ( auth.is_admin() );
-- workers usan service role, bypassing RLS
```

### 4.17 marketing / broadcasts

```sql
alter table broadcasts enable row level security;
create policy bc_admin_all on broadcasts for all using ( auth.is_admin() );
create policy bc_owner_club on broadcasts for all
  using ( scope='club' and club_id is not null and auth.club_staff(club_id) )
  with check ( scope='club' and club_id is not null and auth.club_staff(club_id) );
create policy bc_partner on broadcasts for all
  using ( scope='partner' and partner_id is not null
          and exists(select 1 from partner_members pm
                     where pm.partner_id=broadcasts.partner_id
                       and pm.user_id=auth.uid() and pm.role in ('owner','admin')) );
```

### 4.18 moderation / audit

```sql
alter table reports enable row level security;
create policy reports_reporter_select on reports for select using ( reporter_id = auth.uid() );
create policy reports_admin_all on reports for all using ( auth.is_admin() );
create policy reports_owner_select_own_club on reports for select
  using (
    entity = 'club' and exists(select 1 from clubs c
                               where c.id::text = reports.entity_id::text
                                 and auth.is_owner_of(c.id))
  );
create policy reports_open on reports for insert with check ( reporter_id = auth.uid() );

alter table moderation_actions enable row level security;
create policy ma_admin_all on moderation_actions for all using ( auth.is_admin() );

alter table audit_log enable row level security;
create policy audit_admin_select on audit_log for select using ( auth.is_admin() );
create policy audit_owner_select on audit_log for select using ( club_id is not null and auth.is_owner_of(club_id) );
-- INSERT solo desde trigger SECURITY DEFINER tg_audit
revoke insert, update, delete on audit_log from authenticated, anon;
```

### 4.19 support / tickets

```sql
alter table tickets enable row level security;
create policy tk_opener_self on tickets for select using ( opener_id = auth.uid() );
create policy tk_assignee on tickets for select using ( assignee_id = auth.uid() );
create policy tk_employee_club_select on tickets for select
  using (club_id is not null and auth.is_employee_of(club_id));
create policy tk_club_staff_select on tickets for select
  using (club_id is not null and auth.club_staff(club_id));
create policy tk_club_staff_update on tickets for update
  using (club_id is not null and auth.club_staff(club_id))
  with check (club_id is not null and auth.club_staff(club_id));
create policy tk_assignee_update on tickets for update
  using (assignee_id = auth.uid())
  with check (assignee_id = auth.uid());
create policy tk_club_staff_delete on tickets for delete
  using ( club_id is not null and auth.club_staff(club_id) );
create policy tk_admin_all on tickets for all using ( auth.is_admin() );
create policy tk_user_open on tickets for insert with check ( opener_id = auth.uid() );

alter table ticket_messages enable row level security;
create policy tm_visible on ticket_messages for select
  using ( exists(select 1 from tickets t where t.id=ticket_id and
                 (t.opener_id=auth.uid() or t.assignee_id=auth.uid()
                  or (t.club_id is not null and (auth.club_staff(t.club_id) or auth.is_employee_of(t.club_id)))
                  or auth.is_admin()))
          and ( internal = false or auth.uid() <> (select opener_id from tickets where id=ticket_id) )
  );
create policy tm_post on ticket_messages for insert with check (
  author_id = auth.uid()
  and exists(select 1 from tickets t where t.id=ticket_id
             and (t.opener_id=auth.uid() or t.assignee_id=auth.uid()
                  or (t.club_id is not null and auth.club_staff(t.club_id))))
);
```

### 4.20 feature-flags

```sql
alter table feature_flags enable row level security;
create policy ff_authn_select on feature_flags for select using ( auth.uid() is not null );
create policy ff_admin_all on feature_flags for all using ( auth.is_admin() );

alter table feature_flag_assignments enable row level security;
create policy ffa_admin_all on feature_flag_assignments for all using ( auth.is_admin() );
-- la pantalla "qué flags tengo yo" se consulta vía función security definer fn_my_effective_flags()
```

### 4.21 partners

```sql
alter table partner_orgs enable row level security;
create policy po_member_select on partner_orgs for select
  using ( exists(select 1 from partner_members pm where pm.partner_id=id and pm.user_id=auth.uid()) );
create policy po_admin_all on partner_orgs for all using ( auth.is_admin() );

alter table partner_members enable row level security;
create policy pm_self_select on partner_members for select using ( user_id = auth.uid() );
create policy pm_partner_admin on partner_members for all
  using ( exists(select 1 from partner_members me
                 where me.partner_id=partner_members.partner_id
                   and me.user_id=auth.uid() and me.role in ('owner','admin')) );

alter table partner_club_links enable row level security;
create policy pcl_partner_select on partner_club_links for select
  using ( exists(select 1 from partner_members pm
                 where pm.partner_id=partner_club_links.partner_id and pm.user_id=auth.uid()) );
create policy pcl_club_select on partner_club_links for select
  using ( auth.is_owner_of(club_id) );
create policy pcl_admin_all on partner_club_links for all using ( auth.is_admin() );
```

### 4.22 payouts

> Tabla scope-flexible (`club` / `partner` / `coach`). Cada beneficiario solo ve **sus** payouts; admin lo ve todo. La escritura real (`insert`/`update`) la realizan workers con `service_role` o funciones `security definer` desde el módulo de billing — por eso aquí solo modelamos lectura por scope + un `for all` a admin.

```sql
alter table payouts enable row level security;

create policy po_admin_all on payouts for all
  using ( mp_is_admin() );

create policy po_club_select on payouts for select
  using ( club_id is not null and mp_club_staff(club_id) );

create policy po_partner_select on payouts for select
  using (
    partner_id is not null and exists(
      select 1 from partner_members
      where partner_id = payouts.partner_id
        and user_id = auth.uid()
        and role in ('owner','admin')
    )
  );

create policy po_coach_select on payouts for select
  using ( coach_id = auth.uid() );
```

> Nota: el código usa los helpers `mp_is_admin()` / `mp_club_staff()` (prefijo `mp_`) introducidos junto con el resto de tablas role-gap. Son equivalentes funcionales de `auth.is_admin()` / `auth.club_staff()` definidos en §1.

### 4.23 shifts

> Empleado/coach ve **sus** turnos; staff del club (`owner`/`manager`/`admin`) administra todos los turnos del club. No hay lectura pública.

```sql
alter table shifts enable row level security;

create policy sh_self on shifts for select
  using ( user_id = auth.uid() );

create policy sh_club_staff on shifts for all
  using ( mp_club_staff(club_id) );
```

### 4.24 club_reviews

> Las reviews son **públicas** (cualquiera puede leerlas — son parte de la ficha del club). El usuario escribe / edita / borra solo las suyas. Staff del club las puede leer (incluido el listado por reservation_id null) para responder o monitorear NPS.

```sql
alter table club_reviews enable row level security;

create policy crv_public_select on club_reviews for select
  using ( true );

create policy crv_self_write on club_reviews for all
  using ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );

create policy crv_staff_select on club_reviews for select
  using ( mp_club_staff(club_id) );
```

---

## 5. Service Role: bypass controlado

El cliente Supabase con `service_role` **bypasses RLS** completamente. Se usa solo en:
- `notifications.dispatch` worker (Edge Function)
- Recálculo nocturno de `player_stats` (pg_cron)
- Webhooks de pagos (mutación cruzada `transactions` + `reservations` + `notifications`)
- `fn_materialize_club_from_application` (declarada `security definer`)
- Migraciones y scripts ops

**Nunca** en código que corra en respuesta a una request de usuario salvo en `src/lib/db/client.admin.ts`, que está marcado `import "server-only"` para que no se bundlee.

---

## 6. Storage RLS (buckets)

Supabase Storage usa policies sobre `storage.objects`. Plantilla por bucket:

```sql
-- avatars: lectura pública, escritura self
create policy avatars_read on storage.objects for select
  to public using ( bucket_id = 'avatars' );
create policy avatars_write_self on storage.objects for insert
  to authenticated with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- kyc-docs: privado, escribe applicant, lee admin
create policy kyc_write_applicant on storage.objects for insert
  to authenticated with check (
    bucket_id = 'kyc-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy kyc_read_self on storage.objects for select
  to authenticated using (
    bucket_id = 'kyc-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy kyc_read_admin on storage.objects for select
  to authenticated using (
    bucket_id = 'kyc-docs' and auth.is_admin()
  );

-- resources: signed URLs (no policies de SELECT, se sirven vía URL firmada)
create policy resources_write_coach on storage.objects for insert
  to authenticated with check (
    bucket_id = 'resources'
    and exists(select 1 from coach_profiles where id = auth.uid())
  );
```

---

## 7. Tests pgTAP

```sh
supabase test new rls/reservations_owner_can_cancel.sql
```

Plantilla:

```sql
begin;
select plan(3);

set local role authenticated;
set local "request.jwt.claims" = '{"sub": "00000000-0000-0000-0000-000000000001"}';
set local app.active_role = 'user';

-- given
insert into reservations (id, club_id, court_id, during, organizer_id, sport)
values ('aaaa...', 'clb...', 'crt...', tstzrange(now()+'1 hour', now()+'2 hours'), '00000000-0000-0000-0000-000000000001', 'tennis');

-- when/then
select lives_ok(
  $$ update reservations set status='cancelled' where organizer_id = auth.uid() $$,
  'organizer can cancel own reservation'
);

select throws_ok(
  $$ update reservations set status='cancelled' where organizer_id <> auth.uid() $$,
  '42501', null,
  'organizer cannot cancel another user reservation'
);

select * from finish();
rollback;
```

Pipeline CI corre `supabase db test` por cada PR — fallar la suite **bloquea merge**.

---

## 8. Checklist al crear una tabla nueva

1. ¿Tenant-scoped, self-scoped, o membership-scoped? → elegir plantilla 3.1/3.2/3.3.
2. `enable row level security;`
3. Crear policies para los 4 verbs (SELECT/INSERT/UPDATE/DELETE) o documentar por qué no aplica.
4. Si necesita lectura pública filtrada → vista con `grant select to anon`.
5. Si mutaciones cruzadas → función `security definer` y `revoke` directos.
6. Triggers de `tg_audit` y `tg_set_updated_at` aplicables.
7. Agregar fila en la matriz §2 de este doc.
8. Tests pgTAP cubriendo el rol más restrictivo y el rol con acceso.

---

## 9. Patrones post-MVP (lo que aprendimos a los golpes)

### 9.1 · Tablas que mutamos siempre vía service role

Algunas tablas críticas tienen RLS deliberadamente **restrictiva** y todas
las mutaciones pasan por server actions que usan `getAdminClient()` después
de validar el caller en código. Esto da defensa-en-profundidad: si la auth
del server action falla por cualquier razón, el RLS sigue bloqueando.

| Tabla | Caller permitido en RLS | Mutación real |
|---|---|---|
| `transactions` (UPDATE/INSERT) | owner/manager/admin; employee solo INSERT de flujos esperados | `submitPaymentProof`, `approvePaymentProofAdmin`, `rejectPaymentProofAdmin` → service role |
| `registrations` (UPDATE status) | solo partner/admin del torneo | `updateRegistrationStatus` → service role tras `requirePartnerAdmin` |
| `tournaments` (UPDATE) | solo partner/admin | `setTournamentStatus`, `updateTournamentByOrganizer` → service role |
| `player_subscriptions` (INSERT) | `user_id = auth.uid()` ✓ | el INSERT del propio user pasa por anon |
| `player_subscriptions` (UPDATE) | solo admin | `grantMatchPointPlusAdmin`, `revokeMatchPointPlusAdmin` → service role |
| `platform_config` (UPDATE) | solo admin SELECT, ningún UPDATE expuesto | mutación manual o vía admin client |
| `payouts` (INSERT/UPDATE) | solo admin | hoy sin UI, manual via SQL |

**Regla**: si una server action valida rol en código y mutó con `getServerClient`
y la query falla silenciosa, **revisar si la RLS está dejando pasar**. El
patrón correcto post-MVP es `getAdminClient()` después del check de rol.

**Cuidado con audit_log al usar service role**: `auth.uid()` retorna null
en service-role, así que `tg_audit` registraría `actor_id=null,
actor_role='system'`. Para preservar trazabilidad, llamar el helper
`setAuditActor(admin, callerId, 'admin')` (en `src/lib/db/client.admin.ts`)
ANTES de la mutación. Ver `docs/architecture/20-database.md` §0 mig 086
para el detalle. Aplicado hoy en grant/revoke MATCHPOINT+ y approve/reject
payment proof — si agregas un nuevo flujo admin con `getAdminClient`,
acuérdate de llamarlo o el audit no te va a decir quién hizo qué.

### 9.2 · Fix de recursión infinita en partner_members (mig 069)

La policy `pm_partner_admin` original tenía un `exists(select 1 from
partner_members ...)` inline contra la misma tabla, causando recursión.
Reemplazada por el helper `mp_is_partner_admin_of(partner_id)` (SECURITY
DEFINER) que evade RLS dentro del helper.

```sql
drop policy if exists pm_partner_admin on public.partner_members;
create policy pm_partner_admin on public.partner_members
  for all
  using (mp_is_partner_admin_of(partner_id))
  with check (mp_is_partner_admin_of(partner_id));
```

**Lección**: cualquier policy que necesite chequear membresía en la misma
tabla → usar SECURITY DEFINER helper. NO inline.

El mismo patrón aplica a mensajería desde la mig `20260531044148`: las
policies de `conversation_members`, `conversations`, `messages` y el guard
read-only del DM oficial MATCHPOINT usan helpers `SECURITY DEFINER`
(`mp_is_conversation_member`, `mp_is_conversation_admin`,
`mp_conversation_has_other_system_member`) para no reentrar en RLS de
`conversation_members`.

### 9.3 · Tablas nuevas (migs 070+) — políticas resumidas

| Tabla | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| `tournament_categories` | público (`using (true)`) | admin via service role (CRUD de partner pasa por `requireTournamentEditor`) |
| `tournament_schedule_blocks` | público | admin via service role (igual ↑) |
| `tournament_prizes` | público | admin via service role (igual ↑) |
| `platform_config` | solo admin | mutación manual / service role |
| `payouts` | admin / club staff / partner admin (cada uno ve los suyos) | solo admin |
| `coach_commissions` | el coach mismo, staff del club, admin | solo admin |
| `sponsors`, `sponsor_slots`, `sponsor_placements` | tablas crudas solo admin; público lee `active_sponsor_placements` curada | admin via service role |
| `sponsor_placement_events` | solo admin | tracking vía server action + service role; sin INSERT público directo |
| `sales_leads` | solo admin | intake público vía endpoint con service role; cambios de pipeline admin via service role |
| `help_articles` | authenticated lee `published`; admin todo | admin via service role; vistas vía RPC segura |
| `help_article_revisions` | solo admin | admin via service role |
| `help_feedback` | propio + admin | user upsert propio sobre artículos publicados; admin lee |
| `help_search_logs` | solo admin | user autenticado inserta logs propios de búsqueda |

### 9.4 · Reading vs writing: cuándo usar qué cliente

```
getServerClient (anon + cookies)
├── Usar para SELECTs del usuario logueado (RLS los filtra a lo suyo).
├── NO usar para UPDATE/INSERT en tablas que dejaron a admin/staff
│   (silenciosamente falla porque la RLS bloquea).
└── Auth ya validada por cookie de Supabase.

getAdminClient (service role)
├── Usar SIEMPRE después de validar el rol en código.
├── Bypassa RLS — toda la responsabilidad de autz queda en el server action.
└── NUNCA importar en archivos "use client". El módulo lo bloquea con
    `import "server-only"`.
```

Patrón canónico:

```ts
export async function someAdminOnlyAction(input) {
  return runAction(Schema, input, async (data) => {
    await requireAdminUserId();          // valida rol PRIMERO
    const admin = getAdminClient();      // service role DESPUÉS
    const { error } = await admin
      .from("alguna_tabla")
      .update({ ... })
      .eq("id", data.id);
    if (error) throw new MpError(...);
    return result;
  });
}
```

## RBAC granular en RLS (mig 158/160)

Defensa en profundidad opcional sobre el modelo por RoleKey: el helper
`mp_role_can(uid, cap, club?)` (SECURITY DEFINER, mig 158) consulta la matriz
`role_capabilities`. `admin` siempre devuelve true (inmutable). Para sumar un
gate de capacidad a una política **sin riesgo**, usar el patrón **aditivo**:

```sql
using ( mp_is_admin() or (<chequeo_de_rol_existente> and mp_role_can(auth.uid(), '<cap>', club_id)) )
```

- Sólo **restringe** (el rol pierde acceso si admin apaga la cap en la matriz);
  **nunca amplía** (sigue exigiendo el chequeo de rol original).
- `admin` no se ve afectado si tiene su propia política (`*_admin_all`) en OR.
- Behavior-preserving si la cap está seeded en el nivel que reproduce el acceso
  actual (ej. `owner.sys.roles='own'`).
- `mp_role_can` es SECURITY DEFINER (owner con BYPASSRLS) → no recursa aunque la
  política sea sobre `role_assignments`.
- Aplicado: `role_assignments` owner grant/revoke staff (`sys.roles`). Convertir
  más tablas on-demand con el mismo patrón; NO reescribir las ~95 políticas a la
  vez (riesgo en la capa de seguridad).
