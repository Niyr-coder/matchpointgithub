import { notFound } from "next/navigation";
import { MP_ROLES, type RoleKey } from "@/lib/roles";
import { getMyEffectiveFlags } from "@/server/actions/featureFlags";
import { SHOP_FLAG } from "@/lib/flags/shop";
import { FeatureOffScreen } from "@/components/dashboard/FeatureOffScreen";
import { RoleScreenStub } from "@/components/dashboard/RoleScreenStub";
import { HelpScreen } from "@/components/dashboard/HelpScreen";
import { NotificationPreferencesScreen } from "@/components/dashboard/NotificationPreferencesScreen";
import { AdminClubsScreen } from "@/components/dashboard/admin/AdminClubsScreen";
import { AdminUsersScreen } from "@/components/dashboard/admin/AdminUsersScreen";
import { AdminModScreen } from "@/components/dashboard/admin/AdminModScreen";
import { AdminPagosScreen } from "@/components/dashboard/admin/AdminPagosScreen";
// MERGE: el server AdminMatchPointPlusScreenServer carga la cola de aprobación
// REAL (comprobantes de plan premium + featuring de clubes, historial reciente,
// clubes destacados activos) y alimenta el rediseño analytics/pricing
// AdminMatchPointPlusScreen, que ya recablea lo operativo: aprobar/rechazar
// plan y featuring. La pantalla previa (AdminPlansScreen + AdminPlansScreenView)
// queda preservada/des-importada. Sin regresión.
import { AdminMatchPointPlusScreenServer } from "@/components/dashboard/admin/AdminMatchPointPlusScreenServer";
import { AdminEventsScreen } from "@/components/dashboard/admin/AdminEventsScreen";
import { AdminSupportScreen } from "@/components/dashboard/admin/AdminSupportScreen";
// MERGE: el server AdminMetricsScreen calcula métricas REALES (MAU/DAU activos,
// GMV captured + delta vs periodo anterior, take rate, funnel signup→MP+, heatmap
// de reservas, cohortes de retención reales, top deportes/ciudades/clubes) y
// alimenta el rediseño v2 AdminMetricasView. El selector de periodo/comparar
// re-indexa datos reales; "Exportar" baja un CSV real. Sin regresión.
import { AdminMetricsScreen } from "@/components/dashboard/admin/AdminMetricsScreen";
// MERGE: el server AdminAuditScreen lee audit_log REAL y alimenta el rediseño
// AdminAuditView (categoría/severidad derivadas; actor/ip/ua/diff reales; export
// CSV/JSON real; refresh en vivo).
import { AdminAuditScreen } from "@/components/dashboard/admin/AdminAuditScreen";
// El server AdminConfigScreenServer carga la config REAL de platform_config y
// alimenta AdminConfigView. Las keys editables (take_rate_pct,
// estelar_price_cents, refund_window_days, ranking_min_matches, match_seek_*,
// multisport_enabled, system_messages_enabled) PERSISTEN vía
// updatePlatformConfig (admin-only, auditada); las filas sin key real se
// muestran como solo-lectura (sin lápiz ni save bar), no como inputs muertos.
import { AdminConfigScreenServer } from "@/components/dashboard/admin/AdminConfigScreenServer";
// MERGE: el server AdminRolesScreen lee datos reales (counts/miembros/solicitudes
// /clubes) y alimenta el rediseño AdminRolesView, que ya recablea lo operativo:
// aprobar/rechazar solicitudes, asignar/revocar rol. Sin regresión.
import { AdminRolesScreen } from "@/components/dashboard/admin/AdminRolesScreen";
import { AdminTeamScreen } from "@/components/dashboard/admin/AdminTeamScreen";
import { AdminUserTeamsScreen } from "@/components/dashboard/admin/AdminUserTeamsScreen";
import { AdminPartnersScreen } from "@/components/dashboard/admin/AdminPartnersScreen";
import { AdminAyudaGuiasScreen } from "@/components/dashboard/admin/AdminAyudaGuiasScreen";
// MERGE: el rediseño v2 está cableado a datos/acciones reales dentro de
// AdminFlagsScreen (server) → AdminFlagsView (client). Toggle, rollout, crear,
// borrar y excepciones son reales.
import { AdminFlagsScreen } from "@/components/dashboard/admin/AdminFlagsScreen";
// MERGE: AdminBroadcastScreenServer carga campañas REALES (broadcasts) y alimenta
// el rediseño AdminBroadcastView. Composer envía in-app de verdad (createBroadcast +
// dispatchBroadcast) con audiencia real (countAudience), y el canal Banner publica
// anuncios globales. Aperturas reales; clicks/conversión siguen pendientes.
import { AdminBroadcastScreenServer } from "@/components/dashboard/admin/AdminBroadcastScreenServer";
import { AdminQuedadasScreen } from "@/components/dashboard/admin/_juego/AdminQuedadasScreen";
import { AdminReservasScreen } from "@/components/dashboard/admin/_juego/AdminReservasScreen";
import { AdminMatchesScreen } from "@/components/dashboard/admin/_juego/AdminMatchesScreen";
import { AdminRecepcionScreen } from "@/components/dashboard/admin/_juego/AdminRecepcionScreen";
// Ola 2: el section admin-memberships vuelve al oversight real cross-club.
import { AdminMembershipsScreen } from "@/components/dashboard/admin/AdminMembershipsScreen";
import { AdminSalesScreen } from "@/components/dashboard/admin/AdminSalesScreen";
import { AdminPatrocinadoresScreen } from "@/components/dashboard/admin/AdminPatrocinadoresScreen";
import { AdminPaywallFunnelScreen } from "@/components/dashboard/admin/AdminPaywallFunnelScreen";
import { RankingScreen } from "@/components/dashboard/user/RankingScreen";
import { QuedadasScreen } from "@/components/dashboard/user/QuedadasScreen";
import { ProfileScreen } from "@/components/dashboard/user/ProfileScreen";
import { ClubesScreen } from "@/components/dashboard/user/ClubesScreen";
import { EventosScreen } from "@/components/dashboard/user/EventosScreen";
import { MensajesScreen } from "@/components/dashboard/user/MensajesScreen";
import { AmigosScreen } from "@/components/dashboard/user/AmigosScreen";
import { ShopScreen } from "@/components/dashboard/user/ShopScreen";
import { SolicitarClubScreen } from "@/components/dashboard/user/SolicitarClubScreen";
import { TeamScreen } from "@/components/dashboard/user/TeamScreen";
// BuscoPartidoScreen mantiene el gate real `match_seeks_enabled`: flag off
// renderiza "Pronto"; flag on carga match-seeks/actions/realtime.
import { BuscoPartidoScreen } from "@/components/dashboard/user/BuscoPartidoScreen";
import { AcademiaScreen } from "@/components/dashboard/user/AcademiaScreen";
import { MisClasesScreen } from "@/components/dashboard/user/MisClasesScreen";
import { CoachAIScreen } from "@/components/dashboard/user/CoachAIScreen";
import { SoporteScreen } from "@/components/dashboard/user/SoporteScreen";
import { MiPlanScreen } from "@/components/dashboard/user/MiPlanScreen";
import { MatchPointPlusScreen } from "@/components/dashboard/user/MatchPointPlusScreen";
import { MisReservasScreen } from "@/components/dashboard/user/MisReservasScreen";
import { AyudaGuiasScreen } from "@/components/dashboard/user/AyudaGuiasScreen";
import { ClubReservasScreen } from "@/components/dashboard/club/ClubReservasScreen";
// ClubCanchasScreen: rediseño v2 1:1 del kit + backend real (createCourt /
// updateCourt + appearance / maintenance mig 168) + "now playing" / "next slot"
// derivados de reservations. Galería + Agenda + Floorplan + bulk block.
import { ClubCanchasScreen } from "@/components/dashboard/club/ClubCanchasScreen";
import { ClubClientesScreen } from "@/components/dashboard/club/ClubClientesScreen";
// Fase 1: ClubFinanzasScreen ahora carga datos reales y los pasa al view v2.
// KPIs/30-day/sources/txns/payouts cableados. Ranking por cancha y heatmap
// siguen mock (Fase 2/3). Cuenta bancaria + estado de cuenta sin fuente.
import { ClubFinanzasScreen } from "@/components/dashboard/club/ClubFinanzasScreen";
import { ClubMarketingScreen } from "@/components/dashboard/owner/ClubMarketingScreen";
// V2 cableada: ClubConfigScreen (server loader) → ClubConfigView (7 secciones
// en owner/config-sections/). Cada sección lee/escribe su backend respectivo.
import { ClubConfigScreen } from "@/components/dashboard/club/ClubConfigScreen";
import { ClubEventosScreen } from "@/components/dashboard/club/ClubEventosScreen";
// Personal del club: roster real desde role_assignments + profiles, con asignación,
// revocación y turnos cableados a server actions.
import { ClubStaffScreen } from "@/components/dashboard/club/ClubStaffScreen";
import { ClubReportesScreen } from "@/components/dashboard/manager/ClubReportesScreen";
// MERGE: el rediseño v2 (ClubMembresiasScreenView) está cableado a datos/acciones
// reales vía ClubMembresiasScreen (server) → resuelve el club activo, carga tiers
// + miembros reales y los pasa como prop `data`. CRUD de tiers (crear/editar/
// borrar/publicar) + cola de aprobación de pagos de socios (aprobar/rechazar/
// revocar) son REALES. ClubMembershipsScreen + ClubMembershipsView (la pantalla
// operativa anterior) quedan preservadas y des-importadas.
import { ClubMembresiasScreen } from "@/components/dashboard/club/ClubMembresiasScreen";
import { ClubAnunciosScreen } from "@/components/dashboard/club/ClubAnunciosScreen";
import { ClubSorteosScreen } from "@/components/dashboard/club/ClubSorteosScreen";
import { MyGiveawaysScreen } from "@/components/dashboard/user/MyGiveawaysScreen";
import { MisMembresiasScreen } from "@/components/dashboard/user/MisMembresiasScreen";
import { EmployeeWalkinsScreen } from "@/components/dashboard/employee/EmployeeWalkinsScreen";
import { PartnerTorneosScreen } from "@/components/dashboard/partner/PartnerTorneosScreen";
import { PartnerBracketsScreen } from "@/components/dashboard/partner/PartnerBracketsScreen";
import { PartnerInscritosScreen } from "@/components/dashboard/partner/PartnerInscritosScreen";
import { PartnerLigasScreen } from "@/components/dashboard/partner/PartnerLigasScreen";
import { PartnerClubesScreen } from "@/components/dashboard/partner/PartnerClubesScreen";
import { PartnerFinanzasScreen } from "@/components/dashboard/partner/PartnerFinanzasScreen";
import { PartnerMarketingScreen } from "@/components/dashboard/partner/PartnerMarketingScreen";
import { CoachClasesScreen } from "@/components/dashboard/coach/CoachClasesScreen";
import { CoachAlumnosScreen } from "@/components/dashboard/coach/CoachAlumnosScreen";
import { CoachCalendarScreen } from "@/components/dashboard/coach/CoachCalendarScreen";
import { CoachPagosScreen } from "@/components/dashboard/coach/CoachPagosScreen";
import { CoachRecursosScreen } from "@/components/dashboard/coach/CoachRecursosScreen";
import { CoachProfileScreen } from "@/components/dashboard/coach/CoachProfileScreen";
import { EmployeeCheckinScreen } from "@/components/dashboard/employee/EmployeeCheckinScreen";
import { EmployeeCourtCalendarScreen } from "@/components/dashboard/employee/EmployeeCourtCalendarScreen";
import { EmployeeCajaScreen } from "@/components/dashboard/employee/EmployeeCajaScreen";
// El section "e-shop" renderiza el POS v2 cableado a productos/ventas reales.
// EmployeeProShopScreen es el server shell (lee catálogo + ventas de hoy) y
// delega a EmployeeProShopView (client) que maneja carrito + cobro real via
// `createSale` (RPC `fn_create_sale`, ver mig 039).
import { EmployeeProShopScreen } from "@/components/dashboard/employee/EmployeeProShopScreen";
import { EmployeeSoporteScreen } from "@/components/dashboard/employee/EmployeeSoporteScreen";

function isValidRole(r: string): r is RoleKey {
  return Object.prototype.hasOwnProperty.call(MP_ROLES, r);
}

type ScreenFactory = (searchParams: Promise<Record<string, string | string[] | undefined>>) => React.ReactNode;

// Mapa de pantallas reales por rol+section. Cuando una key no está aquí, cae a RoleScreenStub.
const SCREENS: Partial<Record<RoleKey, Record<string, ScreenFactory>>> = {
  admin: {
    "admin-clubs": () => <AdminClubsScreen />,
    "admin-users": () => <AdminUsersScreen />,
    "admin-mod": () => <AdminModScreen />,
    "admin-pagos": () => <AdminPagosScreen />,
    "admin-plans": () => <AdminMatchPointPlusScreenServer />,
    "admin-events": () => <AdminEventsScreen />,
    "admin-support": (sp) => <AdminSupportScreen searchParams={sp} />,
    "admin-metrics": () => <AdminMetricsScreen />,
    "admin-audit": () => <AdminAuditScreen />,
    "admin-config": () => <AdminConfigScreenServer />,
    "admin-roles": () => <AdminRolesScreen />,
    "admin-team": () => <AdminTeamScreen />,
    "admin-user-teams": () => <AdminUserTeamsScreen />,
    "admin-partners": () => <AdminPartnersScreen />,
    "admin-ayuda-guias": () => <AdminAyudaGuiasScreen />,
    "admin-flags": () => <AdminFlagsScreen />,
    "admin-broadcast": () => <AdminBroadcastScreenServer />,
    "admin-quedadas": () => <AdminQuedadasScreen />,
    "admin-matches": () => <AdminMatchesScreen />,
    "admin-reservas": () => <AdminReservasScreen />,
    "admin-recepcion": () => <AdminRecepcionScreen />,
    "admin-memberships": () => <AdminMembershipsScreen />,
    "admin-ventas": () => <AdminSalesScreen />,
    "admin-sponsors": () => <AdminPatrocinadoresScreen />,
    "admin-paywall-funnel": () => <AdminPaywallFunnelScreen />,
  },
  user: {
    ranking: () => <RankingScreen />,
    perfil: () => <ProfileScreen />,
    clubes: () => <ClubesScreen />,
    eventos: () => <EventosScreen />,
    chat: (sp) => <MensajesScreen searchParams={sp} />,
    amigos: () => <AmigosScreen />,
    shop: () => <ShopScreen />,
    "solicitar-club": () => <SolicitarClubScreen />,
    soporte: () => <SoporteScreen />,
    "mi-plan": () => <MiPlanScreen />,
    // Landing/gestión MATCHPOINT+ (ventas si free · panel si premium activo).
    "mp-plus": () => <MatchPointPlusScreen />,
    team: () => <TeamScreen />,
    "busco-partido": (sp) => <BuscoPartidoScreen searchParams={sp} />,
    quedadas: () => <QuedadasScreen />,
    "coach-ai": () => <CoachAIScreen />,
    academia: () => <AcademiaScreen />,
    "mis-clases": () => <MisClasesScreen />,
    "ayuda-guias": () => <AyudaGuiasScreen />,
    "mis-reservas": () => <MisReservasScreen />,
    membresias: () => <MisMembresiasScreen />,
    "mis-sorteos": () => <MyGiveawaysScreen />,
  },
  owner: {
    "club-reservas": () => <ClubReservasScreen />,
    "club-canchas": () => <ClubCanchasScreen />,
    "club-clientes": () => <ClubClientesScreen />,
    "club-finanzas": () => <ClubFinanzasScreen />,
    "club-marketing": () => <ClubMarketingScreen />,
    "club-config": () => <ClubConfigScreen />,
    "club-eventos": () => <ClubEventosScreen />,
    "club-staff": () => <ClubStaffScreen />,
    "club-membresias": () => <ClubMembresiasScreen />,
    "club-anuncios": () => <ClubAnunciosScreen roleSegment="owner" />,
    "club-sorteos": () => <ClubSorteosScreen roleSegment="owner" />,
  },
  manager: {
    "club-reservas": () => <ClubReservasScreen />,
    "club-canchas": () => <ClubCanchasScreen />,
    "club-clientes": () => <ClubClientesScreen />,
    "club-eventos": () => <ClubEventosScreen />,
    "club-staff": () => <ClubStaffScreen />,
    "club-walkins": () => <EmployeeWalkinsScreen />,
    "club-reportes": () => <ClubReportesScreen />,
    "club-membresias": () => <ClubMembresiasScreen />,
    "club-anuncios": () => <ClubAnunciosScreen roleSegment="manager" />,
    "club-sorteos": () => <ClubSorteosScreen roleSegment="manager" />,
  },
  partner: {
    "p-ligas": () => <PartnerLigasScreen />,
    "p-torneos": () => <PartnerTorneosScreen />,
    "p-brackets": () => <PartnerBracketsScreen />,
    "p-inscritos": () => <PartnerInscritosScreen />,
    "p-clubes": () => <PartnerClubesScreen />,
    "p-finanzas": () => <PartnerFinanzasScreen />,
    "p-marketing": () => <PartnerMarketingScreen />,
  },
  coach: {
    "c-clases": () => <CoachClasesScreen />,
    "c-alumnos": () => <CoachAlumnosScreen />,
    "c-calendar": () => <CoachCalendarScreen />,
    "c-pagos": () => <CoachPagosScreen />,
    "c-recursos": () => <CoachRecursosScreen />,
    "c-perfil": () => <CoachProfileScreen />,
  },
  employee: {
    "e-checkin": () => <EmployeeCheckinScreen />,
    "e-walkins": () => <EmployeeWalkinsScreen />,
    "e-calendario": (sp) => <EmployeeCourtCalendarScreen searchParams={sp} />,
    "e-caja": () => <EmployeeCajaScreen />,
    "e-reservas": () => <ClubReservasScreen showReceptionHourHint />,
    "e-shop": () => <EmployeeProShopScreen />,
    "e-soporte": () => <EmployeeSoporteScreen />,
  },
};

// Secciones gateadas por feature flag: si el flag está off, la pantalla no se
// renderiza (se muestra FeatureOffScreen). Ver src/lib/flags/registry.ts.
const SECTION_FLAGS: Record<string, string> = {
  "coach-ai": "coach_ai_enabled",
  quedadas: "quedadas_enabled",
  "club-membresias": "club_memberships_v2",
  "club-marketing": "club_marketing_enabled",
  "mis-sorteos": "club_giveaways_enabled",
  "club-sorteos": "club_giveaways_enabled",
  shop: "shop_enabled",
  "e-shop": "shop_enabled",
};

/** Flags opt-in: apagados salvo `enabled === true` (default en DB: off). */
const OPT_IN_FLAGS = new Set<string>([SHOP_FLAG]);

export default async function RoleSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ role: string; section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { role, section } = await params;
  if (!isValidRole(role)) notFound();

  // Section "ayuda" disponible para todos los roles. El jugador tiene un centro
  // de ayuda dedicado (search + categorías + glosario); el resto usa la guía
  // contextual compartida por rol.
  if (section === "ayuda") {
    return role === "user" ? <AyudaGuiasScreen /> : <HelpScreen role={role} />;
  }

  if (section === "notificaciones") {
    return <NotificationPreferencesScreen role={role} />;
  }

  // Gate por feature flag: si la sección está atada a un flag y ese flag está
  // explícitamente off para el usuario, mostramos "no disponible". Ausente/on = OK.
  const flagKey = SECTION_FLAGS[section];
  if (flagKey) {
    const fr = await getMyEffectiveFlags();
    if (fr.ok) {
      const off = OPT_IN_FLAGS.has(flagKey) ? fr.data[flagKey] !== true : fr.data[flagKey] === false;
      if (off) return <FeatureOffScreen section={section} />;
    }
  }

  const render = SCREENS[role]?.[section];
  if (render) return <>{render(searchParams)}</>;

  return <RoleScreenStub role={role} activeKey={section} />;
}
