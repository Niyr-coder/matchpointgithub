"use client";

// Provee el switch multideporte + la lista de deportes habilitados a todo el
// árbol cliente. Sembrado una vez en el root layout (server) con el valor de
// fn_multisport_enabled. Ver docs/product/05-multisport.md.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { enabledSports, type Sport } from "@/lib/sports";

type SportsContextValue = {
  multisport: boolean;
  sports: Sport[];
  // true cuando solo hay un deporte → los selectores se ocultan.
  single: boolean;
};

const SportsContext = createContext<SportsContextValue | null>(null);

export function SportsProvider({ multisport, children }: { multisport: boolean; children: ReactNode }) {
  const value = useMemo<SportsContextValue>(() => {
    const sports = enabledSports(multisport);
    return { multisport, sports, single: sports.length === 1 };
  }, [multisport]);
  return <SportsContext.Provider value={value}>{children}</SportsContext.Provider>;
}

// Lista de deportes habilitados. Si por algún motivo no hay provider (no
// debería), cae a solo Pickleball — coherente con el default OFF.
export function useEnabledSports(): SportsContextValue {
  const ctx = useContext(SportsContext);
  if (!ctx) return { multisport: false, sports: ["pickleball"], single: true };
  return ctx;
}
