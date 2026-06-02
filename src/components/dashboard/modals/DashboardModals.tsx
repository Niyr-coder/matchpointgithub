// Wrapper que monta los modales globales del dashboard.
//
// IMPORTANTE: los modales que se abren con eventos window (`mp-open-*`)
// se importan SÍNCRONAMENTE. El approach lazy con `next/dynamic` falló
// en producción porque el dispatch del evento que dispara el mount
// corría antes de que el chunk lazy se descargara — el listener interno
// del modal todavía no existía y el evento se perdía. Si en el futuro
// necesitas lazy por bundle size, hacelo solo para modales NUNCA
// triggereados por evento (ej. un modal abierto vía prop directa).
"use client";
import { CarritoModal } from "./CarritoModal";
import { RetarModal } from "./RetarModal";
import type { RetarHeroWho } from "@/lib/match/retar-hero-present";
import { CrearMatchModal } from "./CrearMatchModal";
import { ReservarCanchaDrawer } from "./ReservarCanchaDrawer";
import { VerMapaOverlay } from "./VerMapaOverlay";
import { CrearEventoModal } from "./CrearEventoModal";
import { InscribirClaseModal } from "./InscribirClaseModal";
// El wizard de onboarding ya no se monta aquí. Ahora vive en /onboarding
// como página dedicada y `dashboard/layout.tsx` redirige cuando
// profiles.onboarded_at es null.

export function DashboardModals({
  currentUserId,
  initialRetarYou = null,
}: {
  currentUserId: string | null;
  initialRetarYou?: RetarHeroWho | null;
}) {
  // Todos mounted siempre. Cada modal mantiene su propio state `open` interno
  // y solo renderiza UI al recibir el evento. Hacer esto es barato porque los
  // modals están "cerrados" (return null) cuando no hay open.
  return (
    <>
      <RetarModal currentUserId={currentUserId} initialYou={initialRetarYou} />
      <CrearMatchModal currentUserId={currentUserId} />
      <ReservarCanchaDrawer />
      <VerMapaOverlay />
      <CarritoModal />
      <CrearEventoModal />
      <InscribirClaseModal />
    </>
  );
}
