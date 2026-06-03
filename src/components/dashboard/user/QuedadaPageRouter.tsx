// Decide, en cliente, qué vista de quedada montar: el panel de GESTIÓN (creador
// / co-host) o el DETALLE read-only (jugador). Fetchea una vez con
// getQuedadaManageData (que ya devuelve `canManage`); según el resultado monta
// QuedadaManagePanel o QuedadaDetailView.
"use client";

import { useEffect, useState } from "react";
import { Skeleton as SkBar } from "@/components/ui/Skeleton";
import { getQuedadaManageData } from "@/server/actions/quedadas";
import { QuedadaManagePanel } from "./QuedadaManagePanel";
import { QuedadaDetailView } from "./QuedadaDetailView";
import type { QuedadaPlayerViewData } from "@/lib/quedadas/game-view-types";

type ManageRouteData = {
  isCreator: boolean;
  meUserId: string;
  cohosts: Array<{ user_id: string }>;
};

/** Gestión solo para creador/co-host de ESTA quedada — no por rol admin global. */
function isQuedadaOrganizer(data: ManageRouteData): boolean {
  return data.isCreator || data.cohosts.some((c) => c.user_id === data.meUserId);
}

export function QuedadaPageRouter({
  quedadaId,
  initialPlayerData = null,
}: {
  quedadaId: string;
  initialPlayerData?: QuedadaPlayerViewData | null;
}) {
  const [canManage, setCanManage] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    getQuedadaManageData({ quedadaId }).then((res) => {
      if (!active) return;
      if (!res.ok) {
        setCanManage(false);
        return;
      }
      const data = res.data as ManageRouteData;
      setCanManage(isQuedadaOrganizer(data));
    });
    return () => {
      active = false;
    };
  }, [quedadaId]);

  if (canManage === null) {
    return (
      <div className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
        <SkBar w={240} h={22} r={8} />
        <SkBar h={56} r={10} />
        <SkBar h={56} r={10} />
      </div>
    );
  }

  return canManage ? (
    <QuedadaManagePanel quedadaId={quedadaId} />
  ) : (
    <QuedadaDetailView quedadaId={quedadaId} initialData={initialPlayerData} />
  );
}
