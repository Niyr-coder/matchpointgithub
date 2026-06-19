-- Elimina campañas demo seedeadas con usos inventados (payload.default_key).
-- Los clubs crean campañas reales desde plantillas predefinidas en la UI.

delete from broadcast_recipients
where broadcast_id in (
  select id from broadcasts
  where scope = 'club'
    and payload ? 'default_key'
);

delete from broadcasts
where scope = 'club'
  and payload ? 'default_key';
