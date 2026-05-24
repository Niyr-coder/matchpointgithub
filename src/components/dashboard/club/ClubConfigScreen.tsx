// Server loader del view v2 de Club · Configuración. Llama a 7 loaders
// (uno por sección) en paralelo y los pasa al View. Cada loader vive en
// `src/server/actions/club-config-*.ts` y sabe leer su backend específico.
import { getServerClient } from "@/lib/db/client.server";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { ClubConfigView, type ClubConfigData } from "./ClubConfigView";
import { loadIdentidadData } from "@/server/actions/club-config-identidad";
import { loadHorariosData } from "@/server/actions/club-config-horarios";
import { loadTarifasData } from "@/server/actions/club-config-tarifas";
import { loadPagosData } from "@/server/actions/club-config-pagos";
import { loadCancelData } from "@/server/actions/club-config-cancel";
import { loadNotifData } from "@/server/actions/club-config-notif";
import { loadReglasData } from "@/server/actions/club-config-reglas";

export async function ClubConfigScreen() {
  const data = await loadData();
  return <ClubConfigView data={data} />;
}

async function loadData(): Promise<ClubConfigData> {
  const clubId = await resolveActiveClubId();
  if (!clubId) {
    return {
      clubId: null,
      healthScore: 0,
      healthMissing: ["no hay club activo"],
    };
  }

  const supabase = await getServerClient();

  const [
    identidad,
    horarios,
    tarifas,
    pagos,
    cancelacion,
    notificaciones,
    reglas,
  ] = await Promise.all([
    loadIdentidadData(supabase, clubId),
    loadHorariosData(supabase, clubId),
    loadTarifasData(supabase, clubId),
    loadPagosData(supabase, clubId),
    loadCancelData(supabase, clubId),
    loadNotifData(supabase, clubId),
    loadReglasData(supabase, clubId),
  ]);

  // Health score básico: cuenta campos clave que faltan (logo, cover,
  // descripción, dirección, teléfono, email, 3+ reglas, 1+ cuenta payout).
  const missing: string[] = [];
  if (!identidad?.logoUrl) missing.push("logo");
  if (!identidad?.coverUrl) missing.push("foto de portada");
  if (!identidad?.description) missing.push("descripción");
  if (!identidad?.address) missing.push("dirección");
  if (!identidad?.phone) missing.push("teléfono");
  if (!identidad?.email) missing.push("email");
  if ((reglas?.rules.length ?? 0) < 3) missing.push("3 reglas mínimo");
  if ((pagos?.accounts.length ?? 0) === 0) missing.push("cuenta bancaria");
  const totalChecks = 8;
  const filled = totalChecks - missing.length;
  const healthScore = Math.round((filled / totalChecks) * 100);

  return {
    clubId,
    identidad: identidad ?? undefined,
    horarios: horarios ?? undefined,
    tarifas: tarifas ?? undefined,
    pagos: pagos ?? undefined,
    cancelacion: cancelacion ?? undefined,
    notificaciones: notificaciones ?? undefined,
    reglas: reglas ?? undefined,
    healthScore,
    healthMissing: missing,
  };
}
