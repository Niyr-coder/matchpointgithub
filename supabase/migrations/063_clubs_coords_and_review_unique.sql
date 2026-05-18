alter table public.clubs
  add column if not exists latitude numeric,
  add column if not exists longitude numeric;

alter table public.club_reviews
  drop constraint if exists club_reviews_club_id_user_id_reservation_id_key;

-- Dedupe: si hay más de una reseña por (club, user), nos quedamos con la más reciente.
delete from public.club_reviews r
using public.club_reviews newer
where r.club_id = newer.club_id
  and r.user_id = newer.user_id
  and r.created_at < newer.created_at;

alter table public.club_reviews
  add constraint club_reviews_club_id_user_id_key
  unique (club_id, user_id);
