// Mapa interactivo de clubes en /clubes — MapLibre + pins con precio real.
"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import maplibregl, { type Map, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CARTODB_VOYAGER_STYLE, MAP_DEFAULT_CENTER } from "@/lib/map/cartodb-voyager-style";

export type ClubesMapClub = {
  id: string;
  slug: string;
  name: string;
  latitude: number;
  longitude: number;
  minPriceCents: number | null;
};

type Props = {
  clubs: ClubesMapClub[];
  totalCount: number;
  height?: number;
};

function priceLabel(cents: number | null): string {
  const n = cents != null ? Math.round(cents / 100) : 12;
  return `$${n}`;
}

function createPriceMarkerEl(label: string, title: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.title = title;
  btn.setAttribute("aria-label", `${title}, ${label} por hora`);
  btn.style.cssText = [
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "padding:0",
    "border:0",
    "background:transparent",
    "cursor:pointer",
    "font-family:inherit",
  ].join(";");
  const pill = document.createElement("div");
  pill.style.cssText = [
    "padding:5px 12px",
    "border-radius:9999px",
    "background:#10b981",
    "color:#fff",
    "font-size:11.5px",
    "font-weight:900",
    "letter-spacing:-0.01em",
    "box-shadow:0 4px 12px rgba(0,0,0,0.22)",
    "white-space:nowrap",
  ].join(";");
  pill.textContent = label;
  const tail = document.createElement("div");
  tail.style.cssText = [
    "width:0",
    "height:0",
    "border-left:6px solid transparent",
    "border-right:6px solid transparent",
    "border-top:8px solid #10b981",
    "margin-top:-1px",
  ].join(";");
  btn.append(pill, tail);
  return btn;
}

export function ClubesMap({ clubs, totalCount, height = 520 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const router = useRouter();

  const mappable = useMemo(
    () =>
      clubs.filter(
        (c) =>
          Number.isFinite(c.latitude) &&
          Number.isFinite(c.longitude) &&
          c.latitude >= -90 &&
          c.latitude <= 90 &&
          c.longitude >= -180 &&
          c.longitude <= 180,
      ),
    [clubs],
  );

  const mapSyncKey = useMemo(
    () => mappable.map((c) => `${c.id}:${c.latitude}:${c.longitude}:${c.minPriceCents}`).join("|"),
    [mappable],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: CARTODB_VOYAGER_STYLE,
      center: [MAP_DEFAULT_CENTER.lng, MAP_DEFAULT_CENTER.lat],
      zoom: 11,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    return () => {
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const syncMarkers = () => {
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];

      for (const club of mappable) {
        const el = createPriceMarkerEl(priceLabel(club.minPriceCents), club.name);
        el.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          router.push(`/clubes/${club.slug}`);
        });
        const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([club.longitude, club.latitude])
          .addTo(map);
        markersRef.current.push(marker);
      }

      if (mappable.length === 0) {
        map.flyTo({
          center: [MAP_DEFAULT_CENTER.lng, MAP_DEFAULT_CENTER.lat],
          zoom: 11,
          duration: 0,
        });
        return;
      }

      if (mappable.length === 1) {
        const c = mappable[0];
        map.flyTo({ center: [c.longitude, c.latitude], zoom: 13, duration: 600 });
        return;
      }

      const bounds = new maplibregl.LngLatBounds();
      for (const c of mappable) bounds.extend([c.longitude, c.latitude]);
      map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 600 });
    };

    if (map.loaded()) {
      syncMarkers();
    } else {
      map.once("load", syncMarkers);
    }

    return () => {
      map.off("load", syncMarkers);
    };
  }, [mapSyncKey, mappable, router]);

  const onMapCount = mappable.length;

  return (
    <div
      style={{
        position: "relative",
        height,
        borderRadius: 14.4,
        overflow: "hidden",
        border: "1px solid var(--border)",
      }}
    >
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <div
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          padding: "6px 12px",
          background: "#fff",
          borderRadius: 9999,
          fontSize: 10.5,
          fontWeight: 800,
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          pointerEvents: "none",
          zIndex: 2,
        }}
      >
        {onMapCount > 0
          ? `${onMapCount} en mapa · ${totalCount} clubes`
          : `${totalCount} clubes`}
      </div>
      {onMapCount === 0 && totalCount > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: 14,
            left: 14,
            right: 14,
            padding: "10px 14px",
            background: "rgba(255,255,255,0.94)",
            borderRadius: 10,
            border: "1px solid var(--border)",
            fontSize: 11.5,
            color: "var(--muted-fg)",
            lineHeight: 1.45,
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          Ningún club de esta lista tiene ubicación en el mapa todavía. Puedes explorarlos en las
          tarjetas de la izquierda.
        </div>
      )}
    </div>
  );
}
