/** Estilo raster CartoDB Voyager — sin API key (mismo que ClubMap / ClubMapPicker). */
export const CARTODB_VOYAGER_STYLE = {
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

export const MAP_DEFAULT_CENTER = { lng: -78.4678, lat: -0.1807 } as const;
