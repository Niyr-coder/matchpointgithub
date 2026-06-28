"use client";
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ClubFeatured } from "@/lib/schemas/clubs";

const CARTODB_STYLE = {
  version: 8 as const,
  sources: {
    cartodb: {
      type: "raster" as const,
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        "https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      ],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [{ id: "cartodb", type: "raster" as const, source: "cartodb" }],
};

const DEFAULT_CENTER: [number, number] = [-78.4678, -0.1807]; // Quito

type MarkerEntry = {
  marker: maplibregl.Marker;
  pill: HTMLElement;
  arrow: HTMLElement;
};

type Props = {
  clubs: ClubFeatured[];
  visibleIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

function makePillEl(
  priceLabel: string,
  selected: boolean,
): { container: HTMLElement; pill: HTMLElement; arrow: HTMLElement } {
  const container = document.createElement("div");
  container.style.cssText =
    "display:flex;flex-direction:column;align-items:center;cursor:pointer;";

  const pill = document.createElement("div");
  pill.style.cssText = [
    "padding:5px 11px;border-radius:9999px;",
    `background:${selected ? "#10b981" : "#0a0a0a"};`,
    "color:#fff;font-size:11.5px;font-weight:900;",
    'font-family:"Plus Jakarta Sans",sans-serif;letter-spacing:-0.01em;',
    `box-shadow:${selected ? "0 0 0 4px rgba(16,185,129,0.25),0 4px 12px rgba(0,0,0,0.22)" : "0 4px 12px rgba(0,0,0,0.22)"};`,
    "white-space:nowrap;transition:background 160ms ease,box-shadow 160ms ease;",
  ].join("");
  pill.textContent = priceLabel;

  const arrow = document.createElement("div");
  arrow.style.cssText = [
    "width:0;height:0;",
    "border-left:6px solid transparent;border-right:6px solid transparent;",
    `border-top:8px solid ${selected ? "#10b981" : "#0a0a0a"};`,
    "margin-top:-1px;transition:border-top-color 160ms ease;",
  ].join("");

  container.appendChild(pill);
  container.appendChild(arrow);
  return { container, pill, arrow };
}

export function ClubesMultiMap({ clubs, visibleIds, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef(new Map<string, MarkerEntry>());
  const onSelectRef = useRef(onSelect);
  const clubsRef = useRef(clubs);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { clubsRef.current = clubs; }, [clubs]);

  // Create map and markers (only on mount)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const clubsWithGeo = clubs.filter(
      (c) => c.latitude != null && c.longitude != null,
    );

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: CARTODB_STYLE,
      center: DEFAULT_CENTER,
      zoom: 11,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.on("load", () => {
      if (clubsWithGeo.length >= 2) {
        const bounds = new maplibregl.LngLatBounds();
        for (const c of clubsWithGeo) {
          bounds.extend([c.longitude!, c.latitude!]);
        }
        map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 0 });
      } else if (clubsWithGeo.length === 1) {
        map.setCenter([clubsWithGeo[0].longitude!, clubsWithGeo[0].latitude!]);
        map.setZoom(14);
      }

      for (const club of clubsWithGeo) {
        const label =
          club.minPriceCents != null
            ? `$${Math.round(club.minPriceCents / 100)}`
            : "—";
        const { container, pill, arrow } = makePillEl(label, false);

        container.addEventListener("click", () => onSelectRef.current(club.id));

        const marker = new maplibregl.Marker({ element: container, anchor: "bottom" })
          .setLngLat([club.longitude!, club.latitude!])
          .addTo(map);

        markersRef.current.set(club.id, { marker, pill, arrow });
      }
    });

    return () => {
      for (const { marker } of markersRef.current.values()) {
        marker.remove();
      }
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show/hide markers based on visibleIds
  useEffect(() => {
    for (const [id, { marker }] of markersRef.current) {
      marker.getElement().style.display = visibleIds.has(id) ? "" : "none";
    }
  }, [visibleIds]);

  // Update selected marker styles and fly to it
  useEffect(() => {
    for (const [id, { pill, arrow }] of markersRef.current) {
      const isSel = id === selectedId;
      pill.style.background = isSel ? "#10b981" : "#0a0a0a";
      pill.style.boxShadow = isSel
        ? "0 0 0 4px rgba(16,185,129,0.25),0 4px 12px rgba(0,0,0,0.22)"
        : "0 4px 12px rgba(0,0,0,0.22)";
      arrow.style.borderTopColor = isSel ? "#10b981" : "#0a0a0a";
    }
    if (selectedId && mapRef.current) {
      const club = clubsRef.current.find((c) => c.id === selectedId);
      if (club?.latitude != null && club?.longitude != null) {
        mapRef.current.flyTo({
          center: [club.longitude, club.latitude],
          zoom: 14,
          duration: 800,
          essential: true,
        });
      }
    }
  }, [selectedId]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
