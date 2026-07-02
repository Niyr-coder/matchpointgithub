-- 20260718000000 · Notif "tu categoría terminó" (tournament_category_finished).
--
-- En torneos multi-categoría cada categoría cierra por separado
-- (tournament_categories.stage = 'complete') y el torneo global sigue live
-- hasta que TODAS terminan. Antes, los jugadores de una categoría terminada
-- no recibían ningún aviso hasta el cierre global. Este kind notifica a los
-- inscritos de ESA categoría apenas se define su final, con el campeón en el
-- body cuando se puede derivar.
--
-- El render usa el fallback genérico del dispatcher: title/body van en el
-- payload desde notifyCategoryFinished (src/lib/notifications/tournament.ts).
-- El href lo deriva NotificationsPanel por kind (vista del jugador en el
-- torneo). Sin feature flag: es un aviso informativo de bajo riesgo; el
-- killswitch natural es revertir el enqueue.

insert into notification_kinds (kind, description, allowed_roles, default_channels, category)
values (
  'tournament_category_finished',
  'Tu categoría del torneo terminó (campeón definido); el torneo puede seguir con otras categorías',
  array['user']::mp_role[],
  array['inapp']::mp_notification_channel[],
  'tournaments'
)
on conflict (kind) do update set
  description      = excluded.description,
  allowed_roles    = excluded.allowed_roles,
  default_channels = excluded.default_channels,
  category         = excluded.category;
