alter table public.tournaments
  add column if not exists is_featured boolean not null default false;

drop view if exists public.tournaments_public_summary;
create view public.tournaments_public_summary as
  select t.id, t.slug, t.name, t.starts_at, t.ends_at, t.prize_pool_cents,
         t.entry_fee_cents, t.currency, t.max_participants, t.sport, t.format,
         t.status,
         c.name AS club_name, c.city AS club_city,
         (select count(*) from registrations r
           where r.tournament_id = t.id
             and r.status = ANY (ARRAY['pending'::text, 'accepted'::text])) as registrations_count,
         t.is_featured
    from tournaments t
    left join clubs c on c.id = t.club_id
   where t.status <> ALL (ARRAY['draft'::mp_event_status, 'cancelled'::mp_event_status]);
