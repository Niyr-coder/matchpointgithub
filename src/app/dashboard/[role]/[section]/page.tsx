import { notFound } from "next/navigation";
import { MP_ROLES, type RoleKey } from "@/lib/roles";
import { getMyEffectiveFlags } from "@/server/actions/featureFlags";
import { FeatureOffScreen } from "@/components/dashboard/FeatureOffScreen";
import { RoleScreenStub } from "@/components/dashboard/RoleScreenStub";
import { HelpScreen } from "@/components/dashboard/HelpScreen";
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
// MERGE: el server AdminConfigScreenServer carga la config REAL de
// platform_config y alimenta el rediseño AdminConfigView. Las keys editables
// (take_rate_pct, estelar_price_cents, refund_window_days, ranking_min_matches,
// match_seek_*, multisport_enabled, system_messages_enabled) PERSISTEN vía
// updatePlatformConfig (admin-only, auditada). La pantalla real previa
// (AdminConfigScreen + AdminConfigScreenView) queda preservada, des-importada.
import { AdminConfigScreenServer } from "@/components/dashboard/admin/AdminConfigScreenServer";
// MERGE: el server AdminRolesScreen lee datos reales (counts/miembros/solicitudes
// /clubes) y alimenta el rediseño AdminRolesView, que ya recablea lo operativo:
// aprobar/rechazar solicitudes, asignar/revocar rol. Sin regresión.
import { AdminRolesScreen } from "@/components/dashboard/admin/AdminRolesScreen";
import { AdminTeamScreen } from "@/components/dashboard/admin/AdminTeamScreen";
import { AdminUserTeamsScreen } from "@/components/dashboard/admin/AdminUserTeamsScreen";
import { AdminAyudaGuiasScreen } from "@/components/dashboard/admin/AdminAyudaGuiasScreen";
// MERGE: el rediseño v2 está cableado a datos/acciones reales dentro de
// AdminFlagsScreen (server) → AdminFlagsView (client). Toggle, rollout, crear,
// borrar y excepciones son reales.
import { AdminFlagsScreen } from "@/components/dashboard/admin/AdminFlagsScreen";
// MERGE: AdminBroadcastScreenServer carga campañas REALES (broadcasts) y alimenta
// el rediseño AdminBroadcastView. Composer envía de verdad (createBroadcast +
// dispatchBroadcast) con audiencia real (countAudience), y el canal Banner publica
// anuncios globales. Funnel de aperturas/clicks sigue demo (sin tracking).
import { AdminBroadcastScreenServer } from "@/components/dashboard/admin/AdminBroadcastScreenServer";
// MERGE: el rediseño "Flair de usuarios" (AdminFlairUsuariosView) ahora se
// alimenta de datos REALES y recablea lo operativo vía AdminCosmeticsFlairScreen
// (server): adopción/distribución real de temas, grants recientes reales,
// grant/revoke de bundles a usuarios (audit), edición de precio/active de
// bundles y activar/desactivar temas incluidos. Sin regresión del grant. La
// pantalla previa AdminCosmeticsScreen queda preservada, des-importada. La
// moderación de flair (reportes/watermarks) queda pendiente de backend (tabla
// nueva, no aplicada — ver 04-placeholders.md).
import { AdminCosmeticsFlairScreen } from "@/components/dashboard/admin/AdminCosmeticsFlairScreen";
import { AdminThemeDesignerView } from "@/components/dashboard/admin/AdminThemeDesignerView";
import { AdminQuedadasScreen } from "@/components/dashboard/admin/AdminQuedadasScreen";
// La pantalla real de oversight (adminListClubMemberships, lista cross-club
// read-only) queda preservada en AdminMembershipsScreen, des-importada. El
// section "admin-memberships" ahora renderiza el rediseño analytics (demo). No
// hay regresión operativa (las membresías las aprueba el staff del club).
import { AdminClubMembresiasScreen } from "@/components/dashboard/admin/AdminClubMembresiasScreen";
import { AdminPatrocinadoresScreen } from "@/components/dashboard/admin/AdminPatrocinadoresScreen";
import { RankingScreen } from "@/components/dashboard/user/RankingScreen";
import { QuedadasScreen } from "@/components/dashboard/user/QuedadasScreen";
import { ProfileScreen } from "@/components/dashboard/user/ProfileScreen";
// Nota: el sistema curado y gateado por MP+ (PersonalizacionScreen +
// PersonalizacionScreenClient) queda intacto para re-cablear el backend del
// nuevo editor de flair. Por ahora el section "personalizar" renderiza el
// editor à-la-carte (localStorage, sin gating todavía).
import { PersonalizacionFlairView } from "@/components/dashboard/user/PersonalizacionFlairView";
import { ClubesScreen } from "@/components/dashboard/user/ClubesScreen";
import { EventosScreen } from "@/components/dashboard/user/EventosScreen";
import { MensajesScreen } from "@/components/dashboard/user/MensajesScreen";
import { AmigosScreen } from "@/components/dashboard/user/AmigosScreen";
import { ShopScreen } from "@/components/dashboard/user/ShopScreen";
import { SolicitarClubScreen } from "@/components/dashboard/user/SolicitarClubScreen";
import { TeamScreen } from "@/components/dashboard/user/TeamScreen";
// El "Busco partido" real (feature flag match_seeks_enabled + match-seeks
// actions) queda preservado en BuscoPartidoScreen/View, des-importado, para
// re-cablear el rediseño de lobby al modelo real. Por ahora el section
// "busco-partido" renderiza el lobby del diseño (mock).
import { BuscarMatchView } from "@/components/dashboard/user/BuscarMatchView";
import { AcademiaScreen } from "@/components/dashboard/user/AcademiaScreen";
import { MisClasesScreen } from "@/components/dashboard/user/MisClasesScreen";
import { CoachAIScreen } from "@/components/dashboard/user/CoachAIScreen";
import { AyudaGuiasScreen } from "@/components/dashboard/user/AyudaGuiasScreen";
import { SoporteScreen } from "@/components/dashboard/user/SoporteScreen";
import { MatchPointPlusScreen } from "@/components/dashboard/user/MatchPointPlusScreen";
import { MiPlanScreen } from "@/components/dashboard/user/MiPlanScreen";
import { MisReservasScreen } from "@/components/dashboard/user/MisReservasScreen";
import { ClubReservasScreen } from "@/components/dashboard/club/ClubReservasScreen";
// ClubCanchasScreen: rediseño v2 1:1 del kit + backend real (createCourt /
// updateCourt + appearance / maintenance mig 168) + "now playing" / "next slot"
// derivados de reservations. Galería + Agenda + Floorplan + bulk block.
import { ClubCanchasScreen } from "@/components/dashboard/club/ClubCanchasScreen";
import { ClubClientesScreen } from "@/components/dashboard/club/ClubClientesScreen";
// La pantalla real (KPIs financieros reales del club, read-only) queda preservada
// en ClubFinanzasScreen, des-importada. El section "club-finanzas" ahora renderiza
// el rediseño v2 (demo, todo el diseño). Sin regresión operativa (era read-only);
// muestra mock en vez de datos reales hasta re-cablear (ver 04-placeholders.md).
import { ClubFinanzasView } from "@/components/dashboard/club/ClubFinanzasView";
import { ClubMarketingScreen } from "@/components/dashboard/owner/ClubMarketingScreen";
// La pantalla real queda preservada en owner/ClubConfigScreen, des-importada. El
// section "club-config" ahora renderiza el rediseño v2 (demo, todo el diseño).
// Ver 04-placeholders.md para qué cablear en el merge.
import { ClubConfigView } from "@/components/dashboard/club/ClubConfigView";
import { ClubEventosScreen } from "@/components/dashboard/club/ClubEventosScreen";
// Personal del club: el rediseño v2 (ClubStaffView) sigue demo, PERO ahora vía
// ClubStaffScreenServer que resuelve el club activo y habilita la asignación REAL
// de staff (owner → AssignStaffModal con términos → assignRole). Ver 04-placeholders.md.
import { ClubStaffScreenServer } from "@/components/dashboard/club/ClubStaffScreenServer";
import { ClubReportesScreen } from "@/components/dashboard/manager/ClubReportesScreen";
// MERGE: el rediseño v2 (ClubMembresiasScreenView) está cableado a datos/acciones
// reales vía ClubMembresiasScreen (server) → resuelve el club activo, carga tiers
// + miembros reales y los pasa como prop `data`. CRUD de tiers (crear/editar/
// borrar/publicar) + cola de aprobación de pagos de socios (aprobar/rechazar/
// revocar) son REALES. ClubMembershipsScreen + ClubMembershipsView (la pantalla
// operativa anterior) quedan preservadas y des-importadas.
import { ClubMembresiasScreen } from "@/components/dashboard/club/ClubMembresiasScreen";
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
    "admin-support": () => <AdminSupportScreen />,
    "admin-metrics": () => <AdminMetricsScreen />,
    "admin-audit": () => <AdminAuditScreen />,
    "admin-config": () => <AdminConfigScreenServer />,
    "admin-roles": () => <AdminRolesScreen />,
    "admin-team": () => <AdminTeamScreen />,
    "admin-user-teams": () => <AdminUserTeamsScreen />,
    "admin-ayuda-guias": () => <AdminAyudaGuiasScreen />,
    "admin-flags": () => <AdminFlagsScreen />,
    "admin-broadcast": () => <AdminBroadcastScreenServer />,
    "admin-cosmetics": () => <AdminCosmeticsFlairScreen />,
    "admin-theme-designer": () => <AdminThemeDesignerView />,
    "admin-quedadas": () => <AdminQuedadasScreen />,
    "admin-memberships": () => <AdminClubMembresiasScreen />,
    "admin-sponsors": () => <AdminPatrocinadoresScreen />,
  },
  user: {
    ranking: () => <RankingScreen />,
    perfil: () => <ProfileScreen />,
    personalizar: () => <PersonalizacionFlairView />,
    clubes: () => <ClubesScreen />,
    eventos: () => <EventosScreen />,
    chat: (sp) => <MensajesScreen searchParams={sp} />,
    amigos: () => <AmigosScreen />,
    shop: () => <ShopScreen />,
    "solicitar-club": () => <SolicitarClubScreen />,
    soporte: () => <SoporteScreen />,
    "mp-plus": () => <MatchPointPlusScreen />,
    team: () => <TeamScreen />,
    "busco-partido": () => <BuscarMatchView />,
    quedadas: () => <QuedadasScreen />,
    "coach-ai": () => <CoachAIScreen />,
    academia: () => <AcademiaScreen />,
    "mis-clases": () => <MisClasesScreen />,
    "mi-plan": () => <MiPlanScreen />,
    "mis-reservas": () => <MisReservasScreen />,
    membresias: () => <MisMembresiasScreen />,
  },
  owner: {
    "club-reservas": () => <ClubReservasScreen />,
    "club-canchas": () => <ClubCanchasScreen />,
    "club-clientes": () => <ClubClientesScreen />,
    "club-finanzas": () => <ClubFinanzasView />,
    "club-marketing": () => <ClubMarketingScreen />,
    "club-config": () => <ClubConfigView />,
    "club-eventos": () => <ClubEventosScreen />,
    "club-staff": () => <ClubStaffScreenServer />,
    "club-membresias": () => <ClubMembresiasScreen />,
  },
  manager: {
    "club-reservas": () => <ClubReservasScreen />,
    "club-canchas": () => <ClubCanchasScreen />,
    "club-clientes": () => <ClubClientesScreen />,
    "club-eventos": () => <ClubEventosScreen />,
    "club-staff": () => <ClubStaffScreenServer />,
    "club-walkins": () => <EmployeeWalkinsScreen />,
    "club-reportes": () => <ClubReportesScreen />,
    "club-membresias": () => <ClubMembresiasScreen />,
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
    "e-caja": () => <EmployeeCajaScreen />,
    "e-reservas": () => <ClubReservasScreen />,
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
};

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

  // Gate por feature flag: si la sección está atada a un flag y ese flag está
  // explícitamente off para el usuario, mostramos "no disponible". Ausente/on = OK.
  const flagKey = SECTION_FLAGS[section];
  if (flagKey) {
    const fr = await getMyEffectiveFlags();
    if (fr.ok && fr.data[flagKey] === false) {
      return <FeatureOffScreen section={section} />;
    }
  }

  const render = SCREENS[role]?.[section];
  if (render) return <>{render(searchParams)}</>;

  return <RoleScreenStub role={role} activeKey={section} />;
}
