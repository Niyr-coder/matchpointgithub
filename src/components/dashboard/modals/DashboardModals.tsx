// Wrapper que monta los 8 modales globales del dashboard de forma lazy.
// Cada modal se importa con next/dynamic y se monta recién cuando llega
// su evento window por primera vez. El evento que disparó el mount se
// re-despacha tras montar para que el modal lo procese (los useEffect
// de los hijos corren antes que los del padre, así el listener ya existe).
"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { CarritoModal } from "./CarritoModal";
// El wizard de onboarding ya no se monta acá. Ahora vive en /onboarding
// como página dedicada y `dashboard/layout.tsx` redirige cuando
// profiles.onboarded_at es null.

type LazyEvents = readonly string[];

function useEventTrigger(events: LazyEvents): boolean {
  const [armed, setArmed] = useState(false);
  const buffered = useRef<Event | null>(null);

  useEffect(() => {
    if (armed) {
      if (buffered.current) {
        const e = buffered.current;
        buffered.current = null;
        window.dispatchEvent(e);
      }
      return;
    }
    const handler = (e: Event) => {
      buffered.current = new CustomEvent(e.type, {
        detail: (e as CustomEvent).detail,
        bubbles: false,
        cancelable: false,
      });
      setArmed(true);
    };
    for (const ev of events) window.addEventListener(ev, handler);
    return () => {
      for (const ev of events) window.removeEventListener(ev, handler);
    };
  }, [armed, events]);

  return armed;
}

const RetarModal = dynamic(() => import("./RetarModal").then((m) => m.RetarModal), { ssr: false });
const CrearMatchModal = dynamic(() => import("./CrearMatchModal").then((m) => m.CrearMatchModal), { ssr: false });
const CrearJuegoModal = dynamic(() => import("./CrearJuegoModal").then((m) => m.CrearJuegoModal), { ssr: false });
const ReservarCanchaDrawer = dynamic(() => import("./ReservarCanchaDrawer").then((m) => m.ReservarCanchaDrawer), { ssr: false });
const VerMapaOverlay = dynamic(() => import("./VerMapaOverlay").then((m) => m.VerMapaOverlay), { ssr: false });
const CrearEventoModal = dynamic(() => import("./CrearEventoModal").then((m) => m.CrearEventoModal), { ssr: false });
const InscribirClaseModal = dynamic(() => import("./InscribirClaseModal").then((m) => m.InscribirClaseModal), { ssr: false });

const TRIG_RETAR: LazyEvents = ["mp-open-retar"];
const TRIG_MATCH: LazyEvents = ["mp-open-crear-match"];
const TRIG_JUEGO: LazyEvents = ["mp-open-crear-juego"];
const TRIG_RESERVA: LazyEvents = ["mp-open-reservar"];
const TRIG_MAPA: LazyEvents = ["mp-open-mapa"];
const TRIG_EVENTO: LazyEvents = ["mp-open-crear-evento"];
const TRIG_CLASE: LazyEvents = ["mp-open-inscribir-clase"];

export function DashboardModals() {
  const retar = useEventTrigger(TRIG_RETAR);
  const match = useEventTrigger(TRIG_MATCH);
  const juego = useEventTrigger(TRIG_JUEGO);
  const reserva = useEventTrigger(TRIG_RESERVA);
  const mapa = useEventTrigger(TRIG_MAPA);
  const evento = useEventTrigger(TRIG_EVENTO);
  const clase = useEventTrigger(TRIG_CLASE);

  return (
    <>
      {retar && <RetarModal />}
      {match && <CrearMatchModal />}
      {juego && <CrearJuegoModal />}
      {reserva && <ReservarCanchaDrawer />}
      {mapa && <VerMapaOverlay />}
      {/* CarritoModal queda always-mounted: expone window.mpCart usado por ShopScreen. */}
      <CarritoModal />
      {evento && <CrearEventoModal />}
      {clase && <InscribirClaseModal />}
    </>
  );
}
