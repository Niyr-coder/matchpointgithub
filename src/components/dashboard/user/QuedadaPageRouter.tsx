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

export function QuedadaPageRouter({ quedadaId }: { quedadaId: string }) {
  const [canManage, setCanManage] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    getQuedadaManageData({ quedadaId }).then((res) => {
      if (!active) return;
      // Si la lectura falla (no miembro, etc.) caemos al detalle read-only,
      // que maneja su propio estado de error.
      setCanManage(res.ok ? ((res.data as { canManage?: boolean }).canManage ?? false) : false);
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
    <QuedadaDetailView quedadaId={quedadaId} />
  );
}
