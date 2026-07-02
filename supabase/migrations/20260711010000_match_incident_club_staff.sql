-- 20260711010000 · Incidentes de partido: notificar también al staff del club.
--
-- reportMatchIncident solo notificaba cuando el torneo tenía partner_id
-- (notifyPartnerOrgStaff). En torneos organizados por un club (partner_id
-- null), el owner/manager veía el feed (RLS mig 20260709010000) pero nunca
-- recibía la notificación. El server action ahora hace fallback a
-- notifyClubStaff — este seed amplía allowed_roles para que el dispatcher no
-- filtre esos destinatarios.

update notification_kinds
   set allowed_roles = array['partner', 'owner', 'manager']::mp_role[]
 where kind = 'match_incident_reported';
