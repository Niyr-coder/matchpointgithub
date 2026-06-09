-- Referidos de perfil: un usuario referido solo puede tener un referrer.
create table if not exists public.profile_referrals (
  referred_user_id uuid primary key references public.profiles(id) on delete cascade,
  referrer_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint profile_referrals_no_self check (referred_user_id <> referrer_user_id)
);

create index if not exists profile_referrals_referrer_created_idx
  on public.profile_referrals (referrer_user_id, created_at desc);

alter table public.profile_referrals enable row level security;

create policy "profile_referrals_select_parties"
  on public.profile_referrals
  for select
  to authenticated
  using (referred_user_id = auth.uid() or referrer_user_id = auth.uid());
