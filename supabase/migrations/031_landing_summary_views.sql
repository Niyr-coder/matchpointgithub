-- 031 · Read-only summary views consumed by the public landing.
-- security_invoker = true → RLS on the underlying tables still applies, so
-- anon only sees rows the existing policies already expose.

create or replace view clubs_public_summary
with (security_invoker = true) as
select
  c.id,
  c.slug,
  c.name,
  c.city,
  c.country,
  c.cover_url,
  c.sports,
  c.currency,
  (
    select count(*) from courts ct
    where ct.club_id = c.id and ct.active
  ) as courts_count,
  (
    select min(cp.price_cents)
    from court_pricing cp
    join courts ct2 on ct2.id = cp.court_id
    where ct2.club_id = c.id and cp.active and ct2.active
  ) as min_price_cents
from clubs c
where c.status = 'active';

create or replace view tournaments_public_summary
with (security_invoker = true) as
select
  t.id,
  t.slug,
  t.name,
  t.starts_at,
  t.ends_at,
  t.prize_pool_cents,
  t.entry_fee_cents,
  t.currency,
  t.max_participants,
  t.sport,
  t.format,
  t.status,
  c.name as club_name,
  c.city as club_city,
  (
    select count(*) from registrations r
    where r.tournament_id = t.id
      and r.status in ('pending','accepted')
  ) as registrations_count
from tournaments t
left join clubs c on c.id = t.club_id
where t.status not in ('draft','cancelled');

grant select on clubs_public_summary to anon, authenticated;
grant select on tournaments_public_summary to anon, authenticated;
