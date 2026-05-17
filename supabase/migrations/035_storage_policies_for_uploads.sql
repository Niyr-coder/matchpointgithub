-- 035 · Storage policies para buckets que reciben uploads del cliente autenticado.
-- Convención de paths: ${userId}/... → el primer segmento debe coincidir con auth.uid().

-- KYC docs (privado) — solo el dueño + admins de plataforma
drop policy if exists "kyc_owner_all" on storage.objects;
create policy "kyc_owner_all" on storage.objects for all
  using (bucket_id = 'kyc-docs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'kyc-docs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "kyc_admin_select" on storage.objects;
create policy "kyc_admin_select" on storage.objects for select
  using (bucket_id = 'kyc-docs' and public.mp_is_admin());

-- Club covers (privado hasta aprobación) — dueño + admins
drop policy if exists "covers_owner_all" on storage.objects;
create policy "covers_owner_all" on storage.objects for all
  using (bucket_id = 'club-covers' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'club-covers' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "covers_admin_select" on storage.objects;
create policy "covers_admin_select" on storage.objects for select
  using (bucket_id = 'club-covers' and public.mp_is_admin());

-- Avatars (público)
drop policy if exists "avatars_public_select" on storage.objects;
create policy "avatars_public_select" on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_write" on storage.objects;
create policy "avatars_owner_write" on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Club courts (público)
drop policy if exists "courts_public_select" on storage.objects;
create policy "courts_public_select" on storage.objects for select
  using (bucket_id = 'club-courts');

drop policy if exists "courts_owner_write" on storage.objects;
create policy "courts_owner_write" on storage.objects for all
  using (bucket_id = 'club-courts' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'club-courts' and (storage.foldername(name))[1] = auth.uid()::text);

-- Tickets attachments (privado)
drop policy if exists "tickets_owner_all" on storage.objects;
create policy "tickets_owner_all" on storage.objects for all
  using (bucket_id = 'tickets-attachments' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'tickets-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "tickets_admin_select" on storage.objects;
create policy "tickets_admin_select" on storage.objects for select
  using (bucket_id = 'tickets-attachments' and public.mp_is_admin());

-- Resources (privado)
drop policy if exists "resources_owner_all" on storage.objects;
create policy "resources_owner_all" on storage.objects for all
  using (bucket_id = 'resources' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'resources' and (storage.foldername(name))[1] = auth.uid()::text);
