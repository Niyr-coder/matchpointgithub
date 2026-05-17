-- 038 · Helper RPC para bulk stats de club_reviews.
-- La tabla club_reviews ya fue creada en 032_role_gaps.sql con esquema:
-- (id, club_id, user_id, rating 1-5, nps 0-10, comment, reservation_id, created_at).
-- Esta migration sólo agrega el RPC que el frontend usa para evitar N+1 al listar clubes.

create or replace function get_club_review_stats(p_club_ids uuid[])
returns table (club_id uuid, avg_rating numeric, reviews_count bigint)
language sql
stable
as $$
  select
    c.club_id,
    round(coalesce(avg(r.rating)::numeric, 0), 2) as avg_rating,
    count(r.id) as reviews_count
  from unnest(p_club_ids) as c(club_id)
  left join club_reviews r on r.club_id = c.club_id
  group by c.club_id;
$$;

revoke all on function get_club_review_stats(uuid[]) from public;
grant execute on function get_club_review_stats(uuid[]) to anon, authenticated;
