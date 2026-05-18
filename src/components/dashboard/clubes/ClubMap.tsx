// MapLibre GL render del mapa del club. Usa raster tiles de CartoDB Voyager
// (gratis, sin API key). Atribuición visible abajo a la derecha por TOS.
"use client";
import { useEffect, useRef } from "react";
import maplibregl, { type Map, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Props = {
  latitude: number;
  longitude: number;
  zoom?: number;
  height?: number;
};

export function ClubMap({ latitude, longitude, zoom = 15, height = 220 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: ref.current,
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
      center: [longitude, latitude],
      zoom,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    // Pin custom: círculo verde con borde blanco y "tail" abajo (gota).
    const el = document.createElement("div");
    el.style.cssText = `
      width: 20px; height: 20px; border-radius: 50% 50% 50% 0;
      background: #10b981; border: 2px solid #fff;
      box-shadow: 0 4px 10px rgba(0,0,0,0.25);
      transform: rotate(-45deg);
    `;
    const inner = document.createElement("div");
    inner.style.cssText = `
      width: 6px; height: 6px; border-radius: 50%;
      background: #fff; margin: 5px auto;
    `;
    el.appendChild(inner);

    markerRef.current = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([longitude, latitude])
      .addTo(map);

    return () => {
      markerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [latitude, longitude, zoom]);

  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        height,
        display: "block",
      }}
    />
  );
}
