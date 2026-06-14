import type { RoleKey } from "@/lib/roles";

export type RoleSwitchOption = {
  role: RoleKey;
  clubId?: string | null;
  partnerId?: string | null;
};
