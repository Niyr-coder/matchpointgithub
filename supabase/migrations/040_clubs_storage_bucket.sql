-- 040 · Bucket `clubs` para logos + covers de clubes ACTIVOS.
--
-- El bucket existente `club-covers` exige path `{userId}/...` (pensado para
-- la fase de aplicación, donde solo el applicant sube). Post-aprobación
-- necesitamos que cualquier staff del club (owner o manager, no solo el
-- applicant original) pueda actualizar el cover/logo.
--
-- Path convention: `{clubId}/logo.{ext}` y `{clubId}/cover.{ext}`.
-- Public read (logos/covers se muestran en /clubes, /user/clubes, etc).

insert into storage.buckets (id, name, public)
values ('clubs', 'clubs', true)
on conflict (id) do nothing;

drop policy if exists "clubs_public_select" on storage.objects;
create policy "clubs_public_select" on storage.objects for select
  using (bucket_id = 'clubs');

-- INSERT/UPDATE/DELETE solo si el caller es staff (owner/manager/admin)
-- del clubId que aparece como primer segmento del path.
drop policy if exists "clubs_staff_write" on storage.objects;
create policy "clubs_staff_write" on storage.objects for insert
  with check (
    bucket_id = 'clubs'
    and public.mp_club_staff(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "clubs_staff_update" on storage.objects;
create policy "clubs_staff_update" on storage.objects for update
  using (
    bucket_id = 'clubs'
    and public.mp_club_staff(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "clubs_staff_delete" on storage.objects;
create policy "clubs_staff_delete" on storage.objects for delete
  using (
    bucket_id = 'clubs'
    and public.mp_club_staff(((storage.foldername(name))[1])::uuid)
  );
