import { notFound } from "next/navigation";
import { MP_ROLES, type RoleKey } from "@/lib/roles";
import { RoleScreenStub } from "@/components/dashboard/RoleScreenStub";
import { HelpScreen } from "@/components/dashboard/HelpScreen";
import { AdminClubsScreen } from "@/components/dashboard/admin/AdminClubsScreen";
import { AdminUsersScreen } from "@/components/dashboard/admin/AdminUsersScreen";
import { AdminModScreen } from "@/components/dashboard/admin/AdminModScreen";
import { AdminPagosScreen } from "@/components/dashboard/admin/AdminPagosScreen";
import { AdminPlansScreen } from "@/components/dashboard/admin/AdminPlansScreen";
import { AdminEventsScreen } from "@/components/dashboard/admin/AdminEventsScreen";
import { AdminSupportScreen } from "@/components/dashboard/admin/AdminSupportScreen";
import { AdminMetricsScreen } from "@/components/dashboard/admin/AdminMetricsScreen";
import { AdminAuditScreen } from "@/components/dashboard/admin/AdminAuditScreen";
import { AdminConfigScreen } from "@/components/dashboard/admin/AdminConfigScreen";
import { AdminRolesScreen } from "@/components/dashboard/admin/AdminRolesScreen";
import { AdminTeamScreen } from "@/components/dashboard/admin/AdminTeamScreen";
import { AdminFlagsScreen } from "@/components/dashboard/admin/AdminFlagsScreen";
import { AdminBroadcastScreen } from "@/components/dashboard/admin/AdminBroadcastScreen";
import { AdminCosmeticsScreen } from "@/components/dashboard/admin/AdminCosmeticsScreen";
import { RankingScreen } from "@/components/dashboard/user/RankingScreen";
import { ProfileScreen } from "@/components/dashboard/user/ProfileScreen";
import { PersonalizacionScreen } from "@/components/dashboard/user/PersonalizacionScreen";
import { ClubesScreen } from "@/components/dashboard/user/ClubesScreen";
import { EventosScreen } from "@/components/dashboard/user/EventosScreen";
import { MensajesScreen } from "@/components/dashboard/user/MensajesScreen";
import { AmigosScreen } from "@/components/dashboard/user/AmigosScreen";
import { ShopScreen } from "@/components/dashboard/user/ShopScreen";
import { SolicitarClubScreen } from "@/components/dashboard/user/SolicitarClubScreen";
import { TeamScreen } from "@/components/dashboard/user/TeamScreen";
import { BuscoPartidoScreen } from "@/components/dashboard/user/BuscoPartidoScreen";
import { AcademiaScreen } from "@/components/dashboard/user/AcademiaScreen";
import { MisClasesScreen } from "@/components/dashboard/user/MisClasesScreen";
import { MiPlanScreen } from "@/components/dashboard/user/MiPlanScreen";
import { MisReservasScreen } from "@/components/dashboard/user/MisReservasScreen";
import { ClubReservasScreen } from "@/components/dashboard/club/ClubReservasScreen";
import { ClubCanchasScreen } from "@/components/dashboard/club/ClubCanchasScreen";
import { ClubClientesScreen } from "@/components/dashboard/club/ClubClientesScreen";
import { ClubFinanzasScreen } from "@/components/dashboard/club/ClubFinanzasScreen";
import { ClubMarketingScreen } from "@/components/dashboard/owner/ClubMarketingScreen";
import { ClubConfigScreen } from "@/components/dashboard/owner/ClubConfigScreen";
import { ClubEventosScreen } from "@/components/dashboard/club/ClubEventosScreen";
import { ClubStaffScreen } from "@/components/dashboard/club/ClubStaffScreen";
import { ClubReportesScreen } from "@/components/dashboard/manager/ClubReportesScreen";
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
import { EmployeeShopScreen } from "@/components/dashboard/employee/EmployeeShopScreen";
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
    "admin-plans": () => <AdminPlansScreen />,
    "admin-events": () => <AdminEventsScreen />,
    "admin-support": () => <AdminSupportScreen />,
    "admin-metrics": () => <AdminMetricsScreen />,
    "admin-audit": () => <AdminAuditScreen />,
    "admin-config": () => <AdminConfigScreen />,
    "admin-roles": () => <AdminRolesScreen />,
    "admin-team": () => <AdminTeamScreen />,
    "admin-flags": () => <AdminFlagsScreen />,
    "admin-broadcast": () => <AdminBroadcastScreen />,
    "admin-cosmetics": () => <AdminCosmeticsScreen />,
  },
  user: {
    ranking: () => <RankingScreen />,
    perfil: () => <ProfileScreen />,
    personalizar: () => <PersonalizacionScreen />,
    clubes: () => <ClubesScreen />,
    eventos: () => <EventosScreen />,
    chat: (sp) => <MensajesScreen searchParams={sp} />,
    amigos: () => <AmigosScreen />,
    shop: () => <ShopScreen />,
    "solicitar-club": () => <SolicitarClubScreen />,
    team: () => <TeamScreen />,
    "busco-partido": (sp) => <BuscoPartidoScreen searchParams={sp} />,
    academia: () => <AcademiaScreen />,
    "mis-clases": () => <MisClasesScreen />,
    "mi-plan": () => <MiPlanScreen />,
    "mis-reservas": () => <MisReservasScreen />,
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
  },
  manager: {
    "club-reservas": () => <ClubReservasScreen />,
    "club-canchas": () => <ClubCanchasScreen />,
    "club-clientes": () => <ClubClientesScreen />,
    "club-eventos": () => <ClubEventosScreen />,
    "club-staff": () => <ClubStaffScreen />,
    "club-walkins": () => <EmployeeWalkinsScreen />,
    "club-reportes": () => <ClubReportesScreen />,
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
    "e-shop": () => <EmployeeShopScreen />,
    "e-soporte": () => <EmployeeSoporteScreen />,
  },
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

  // Section "ayuda" disponible para todos los roles: render compartido.
  if (section === "ayuda") return <HelpScreen role={role} />;

  const render = SCREENS[role]?.[section];
  if (render) return <>{render(searchParams)}</>;

  return <RoleScreenStub role={role} activeKey={section} />;
}
