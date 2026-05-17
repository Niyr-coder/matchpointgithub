-- 029 · Fix tg_audit() to handle composite-PK tables (no `id` column).
-- Was crashing inserts on: club_amenities, coach_clubs, coach_specialties,
-- conversation_members, friendships, team_members, notification_kinds,
-- notification_preferences, partner_members, partner_club_links, etc.
--
-- Replace direct `(new).id` access with a safe to_jsonb lookup that returns
-- NULL if the column isn't present.

create or replace function tg_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  _actor uuid := auth.uid();
  _role text := coalesce(current_setting('app.active_role', true), 'system');
  _club uuid := nullif(current_setting('app.active_club_id', true), '')::uuid;
  _row jsonb;
  _entity_id uuid;
  _diff jsonb;
begin
  _row := case tg_op when 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  -- Use jsonb -> '?' to avoid crashing on tables without an `id` column.
  begin
    _entity_id := nullif(_row->>'id', '')::uuid;
  exception when others then
    _entity_id := null;
  end;

  _diff := case tg_op
    when 'INSERT' then to_jsonb(new)
    when 'DELETE' then to_jsonb(old)
    when 'UPDATE' then jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new))
  end;

  insert into audit_log (actor_id, actor_role, club_id, entity, entity_id, action, diff)
  values (_actor, _role, _club, tg_table_name, _entity_id, tg_op, _diff);

  return coalesce(new, old);
end $$;
