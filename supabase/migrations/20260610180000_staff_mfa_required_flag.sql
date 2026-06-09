-- Flag global: 2FA TOTP obligatorio para roles staff (todos excepto jugador).
-- Off por defecto hasta cablear UI enroll/verify. Gate en dashboard/[role]/layout.
insert into public.feature_flags (key, description, enabled_default, rollout_pct, env, impact, label)
values (
  'staff_mfa_required',
  'Encendido = roles staff (admin, owner, manager, partner, coach, employee) exigen TOTP (aal2) antes del dashboard. Jugador (user) sin 2FA. Requiere App Authenticator ON en Supabase Auth.',
  false,
  0,
  'prod',
  'high',
  '2FA staff (TOTP)'
)
on conflict (key) do update set
  description = excluded.description,
  label = excluded.label,
  impact = excluded.impact;
