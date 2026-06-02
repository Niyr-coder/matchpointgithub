"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PerfilMe } from "./mapProfileData";

const PerfilV3DataContext = createContext<PerfilMe | null>(null);

export function PerfilV3DataProvider({ value, children }: { value: PerfilMe; children: ReactNode }) {
  return <PerfilV3DataContext.Provider value={value}>{children}</PerfilV3DataContext.Provider>;
}

export function usePerfilV3Data(): PerfilMe {
  const v = useContext(PerfilV3DataContext);
  if (!v) throw new Error("PerfilV3DataProvider requerido");
  return v;
}
