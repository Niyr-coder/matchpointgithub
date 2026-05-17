import { notFound } from "next/navigation";
import { MP_ROLES, type RoleKey } from "@/lib/roles";
import { AdminHome } from "@/components/dashboard/admin/AdminHome";
import { UserHome } from "@/components/dashboard/user/UserHome";
import { OwnerHome } from "@/components/dashboard/owner/OwnerHome";
import { ManagerHome } from "@/components/dashboard/manager/ManagerHome";
import { PartnerHome } from "@/components/dashboard/partner/PartnerHome";
import { CoachHome } from "@/components/dashboard/coach/CoachHome";
import { EmployeeHome } from "@/components/dashboard/employee/EmployeeHome";
import { RoleScreenStub } from "@/components/dashboard/RoleScreenStub";

function isValidRole(r: string): r is RoleKey {
  return Object.prototype.hasOwnProperty.call(MP_ROLES, r);
}

export default async function RoleHomePage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;
  if (!isValidRole(role)) notFound();

  if (role === "admin") return <AdminHome />;
  if (role === "user") return <UserHome />;
  if (role === "owner") return <OwnerHome />;
  if (role === "manager") return <ManagerHome />;
  if (role === "partner") return <PartnerHome />;
  if (role === "coach") return <CoachHome />;
  if (role === "employee") return <EmployeeHome />;

  return <RoleScreenStub role={role} activeKey="home" />;
}
