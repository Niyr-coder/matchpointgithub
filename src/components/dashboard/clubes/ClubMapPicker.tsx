// Modal con MapLibre para que el owner setee las coords del club click-to-pin.
// Centra en coords actuales o en Quito (-0.1807, -78.4678) si no hay.
"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Icon } from "@/components/Icon";

type Props = {
  initialLat: number | null;
  initialLng: number | null;
  onCancel: () => void;
  onSave: (lat: number, lng: number) => void;
  saving?: boolean;
};

const DEFAULT_CENTER = { lat: -0.1807, lng: -78.4678 }; // Quito.

export function ClubMapPicker({
  initialLat,
  initialLng,
  onCancel,
  onSave,
  saving,
}: Props) {
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: initialLat ?? DEFAULT_CENTER.lat,
    lng: initialLng ?? DEFAULT_CENTER.lng,
  });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          cartodb: {
            type: "raster",
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
        layers: [{ id: "cartodb", type: "raster", source: "cartodb" }],
      },
      center: [coords.lng, coords.lat],
      zoom: initialLat != null ? 15 : 13,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    // Pin draggable.
    const el = document.createElement("div");
    el.style.cssText = `
      width: 24px; height: 24px; border-radius: 50% 50% 50% 0;
      background: #10b981; border: 3px solid #fff;
      box-shadow: 0 4px 14px rgba(0,0,0,0.35);
      transform: rotate(-45deg);
      cursor: grab;
    `;
    const inner = document.createElement("div");
    inner.style.cssText = `
      width: 7px; height: 7px; border-radius: 50%;
      background: #fff; margin: 6px auto;
    `;
    el.appendChild(inner);

    const marker = new maplibregl.Marker({ element: el, anchor: "bottom", draggable: true })
      .setLngLat([coords.lng, coords.lat])
      .addTo(map);
    markerRef.current = marker;

    marker.on("dragend", () => {
      const ll = marker.getLngLat();
      setCoords({ lat: ll.lat, lng: ll.lng });
    });

    // Click en mapa también reposiciona el pin.
    map.on("click", (e) => {
      marker.setLngLat(e.lngLat);
      setCoords({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    return () => {
      marker.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,10,0.55)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "min(720px, 100%)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div className="label-mp">Ubicación del club</div>
            <div
              className="font-heading"
              style={{
                fontSize: 18,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
                marginTop: 2,
              }}
            >
              Click en el mapa para fijar el pin
            </div>
          </div>
          <button
            onClick={onCancel}
            aria-label="Cerrar"
            style={{
              background: "transparent",
              border: 0,
              color: "var(--muted-fg)",
              cursor: "pointer",
              fontSize: 18,
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        <div ref={containerRef} style={{ width: "100%", height: 420, background: "var(--muted)" }} />

        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: 14,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "0.16em",
                color: "var(--muted-fg)",
                textTransform: "uppercase",
              }}
            >
              Coords
            </div>
            <div
              className="font-heading tabular"
              style={{ fontSize: 14, fontWeight: 900, marginTop: 2 }}
            >
              {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
            </div>
          </div>
          <button
            onClick={onCancel}
            className="btn"
            style={{
              background: "#fff",
              border: "1px solid var(--border)",
            }}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onSave(coords.lat, coords.lng)}
            disabled={saving}
          >
            <Icon name="check" size={13} />
            {saving ? "Guardando…" : "Guardar ubicación"}
          </button>
        </div>
      </div>
    </div>
  );
}
