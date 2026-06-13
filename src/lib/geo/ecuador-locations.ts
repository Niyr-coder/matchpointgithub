/** Provincia → ciudad → parroquia/sector para formularios en Ecuador. */

import { LATAM_COUNTRIES, findProvince } from "./latam";

const EC = LATAM_COUNTRIES.find((c) => c.code === "EC");

/** Parroquias/sectores por ciudad. Si no hay entrada, cae a [nombre de la ciudad]. */
const SECTORS_BY_CITY: Record<string, string[]> = {
  "Pichincha|Quito": [
    "La Carolina",
    "Iñaquito",
    "La Mariscal",
    "Centro Histórico",
    "La Floresta",
    "Bellavista",
    "El Condado",
  ],
  "Pichincha|Cumbayá": ["Cumbayá", "Tumbaco", "Puembo"],
  "Pichincha|Tumbaco": ["Tumbaco", "Quito Metropolitano"],
  "Pichincha|Sangolquí": ["Sangolquí", "San Rafael", "San Pedro de Taboada"],
  "Pichincha|Machachi": ["Machachi", "Aloasí"],
  "Guayas|Guayaquil": [
    "Urdaneta",
    "Kennedy",
    "Sauces",
    "Centro",
    "Tarqui",
    "Ximena",
    "Letamendi",
  ],
  "Guayas|Samborondón": ["Samborondón", "La Puntilla", "Entre Ríos"],
  "Guayas|Durán": ["Durán", "Eloy Alfaro"],
  "Azuay|Cuenca": ["El Batán", "Yanuncay", "Turi", "Centro Histórico"],
  "Manabí|Portoviejo": ["Portoviejo", "Andrés de Vera", "Colón", "Picoaza"],
  "Manabí|Manta": ["Manta", "Los Esteros", "Tarqui", "San Mateo"],
  "Manabí|Chone": ["Chone", "Convento"],
  "Tungurahua|Ambato": ["Ambato", "Ficoa", "La Matriz"],
  "Tungurahua|Baños": ["Baños", "Río Verde"],
  "Imbabura|Ibarra": ["Ibarra", "La Esperanza", "Ambuquí"],
  "Imbabura|Otavalo": ["Otavalo", "San Pablo del Lago"],
  "Loja|Loja": ["Loja", "San Sebastián", "Sucre"],
  "El Oro|Machala": ["Machala", "El Cambio", "Jubones"],
  "Los Ríos|Quevedo": ["Quevedo", "Guayacán"],
  "Los Ríos|Babahoyo": ["Babahoyo", "Febres Cordero"],
  "Santa Elena|Salinas": ["Salinas", "Chipipe", "Anconcito"],
  "Santa Elena|La Libertad": ["La Libertad", "Ballenita"],
};

function sectorKey(province: string, city: string): string {
  return `${province}|${city}`;
}

export function getEcuadorProvinces(): string[] {
  return EC?.provinces.map((p) => p.name) ?? [];
}

export function getCitiesForProvince(provinceName: string): string[] {
  return findProvince("EC", provinceName)?.cities ?? [];
}

export function getSectorsForCity(provinceName: string, cityName: string): string[] {
  if (!provinceName || !cityName) return [];
  const custom = SECTORS_BY_CITY[sectorKey(provinceName, cityName)];
  if (custom?.length) return custom;
  return [cityName];
}

/** Rehidrata ciudad/sector desde district guardado en borradores viejos. */
export function resolveLocationFromDistrict(
  province: string | null | undefined,
  district: string | null | undefined,
): { locationCity: string; sector: string } {
  const prov = province?.trim() ?? "";
  const dist = district?.trim() ?? "";
  if (!dist) return { locationCity: "", sector: "" };

  const cities = getCitiesForProvince(prov);
  if (cities.includes(dist)) {
    return { locationCity: dist, sector: dist };
  }

  for (const city of cities) {
    const sectors = getSectorsForCity(prov, city);
    if (sectors.includes(dist)) {
      return { locationCity: city, sector: dist };
    }
  }

  if (cities.length === 1) {
    return { locationCity: cities[0], sector: dist };
  }

  return { locationCity: "", sector: dist };
}

/** Centro aproximado de Ecuador — fallback del mapa de avisos. */
export const ECUADOR_CENTER = { lat: -1.8312, lng: -78.1834 } as const;

/** Coordenadas urbanas aproximadas por ciudad (centro). */
const ECUADOR_CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  Quito: { lat: -0.1807, lng: -78.4678 },
  Cumbayá: { lat: -0.1969, lng: -78.4412 },
  Tumbaco: { lat: -0.2145, lng: -78.4065 },
  Calderón: { lat: -0.1028, lng: -78.4756 },
  Sangolquí: { lat: -0.334, lng: -78.4522 },
  Machachi: { lat: -0.5103, lng: -78.5671 },
  Cayambe: { lat: 0.0408, lng: -78.1457 },
  Guayaquil: { lat: -2.1894, lng: -79.8891 },
  Durán: { lat: -2.176, lng: -79.855 },
  Samborondón: { lat: -2.129, lng: -79.861 },
  Daule: { lat: -1.861, lng: -79.974 },
  Milagro: { lat: -2.134, lng: -79.593 },
  Cuenca: { lat: -2.9001, lng: -79.0059 },
  Ambato: { lat: -1.2491, lng: -78.6168 },
  Manta: { lat: -0.9677, lng: -80.7089 },
  Portoviejo: { lat: -1.0546, lng: -80.4545 },
  Loja: { lat: -3.993, lng: -79.204 },
  Ibarra: { lat: 0.3517, lng: -78.1223 },
  Otavalo: { lat: 0.2342, lng: -78.2627 },
  Riobamba: { lat: -1.6635, lng: -78.6546 },
  Latacunga: { lat: -0.9345, lng: -78.6155 },
  Machala: { lat: -3.2581, lng: -79.9554 },
  Esmeraldas: { lat: 0.9682, lng: -79.6517 },
  Babahoyo: { lat: -1.802, lng: -79.534 },
  Quevedo: { lat: -1.0286, lng: -79.463 },
  "Santo Domingo": { lat: -0.2522, lng: -79.1754 },
  Tulcán: { lat: 0.8115, lng: -77.7171 },
  Tena: { lat: -0.9938, lng: -77.8129 },
  Puyo: { lat: -1.4927, lng: -78.002 },
  "Puerto Ayora": { lat: -0.739, lng: -90.3518 },
  Salinas: { lat: -2.214, lng: -80.951 },
  "Santa Elena": { lat: -2.2267, lng: -80.858 },
};

function hashCityOffset(city: string): { lat: number; lng: number } {
  let h = 0;
  for (let i = 0; i < city.length; i += 1) h = (h * 31 + city.charCodeAt(i)) | 0;
  return {
    lat: ((h % 100) - 50) * 0.018,
    lng: (((h / 100) | 0) % 100 - 50) * 0.018,
  };
}

/** Resuelve coords por nombre de ciudad o formato "Provincia / Ciudad". */
export function cityCoords(city: string | null | undefined): { lat: number; lng: number; approximate: boolean } {
  const raw = city?.trim();
  if (!raw) {
    return { ...ECUADOR_CENTER, approximate: true };
  }
  const candidates = [raw];
  if (raw.includes("/")) {
    const tail = raw.split("/").pop()?.trim();
    if (tail) candidates.unshift(tail);
  }
  for (const name of candidates) {
    const direct = ECUADOR_CITY_COORDS[name];
    if (direct) return { ...direct, approximate: false };
    const found = Object.keys(ECUADOR_CITY_COORDS).find((k) => k.toLowerCase() === name.toLowerCase());
    if (found) return { ...ECUADOR_CITY_COORDS[found], approximate: false };
  }
  const off = hashCityOffset(raw);
  return {
    lat: ECUADOR_CENTER.lat + off.lat,
    lng: ECUADOR_CENTER.lng + off.lng,
    approximate: true,
  };
}
