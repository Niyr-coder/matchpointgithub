// MERGE: server que carga la config REAL de platform_config y alimenta el
// rediseño AdminConfigView. Las keys de EDITABLE_CONFIG persisten de verdad
// vía updatePlatformConfig (admin-only, auditada). El resto de filas del
// diseño se conserva como display read-only (constantes del app / superficies
// sin tabla de config). Reemplaza el render demo. Ver docs/guides/03-platform-config.md.
import { getRawPlatformConfig } from "@/server/queries/platform-config";
import { EDITABLE_CONFIG } from "@/lib/config/editable-config";
import { AdminConfigView, type RealConfig } from "./AdminConfigView";

const EDITABLE_KEYS = Object.keys(EDITABLE_CONFIG);

export async function AdminConfigScreenServer() {
  const rows = await getRawPlatformConfig(EDITABLE_KEYS);
  const real: RealConfig = {};
  for (const key of EDITABLE_KEYS) {
    const row = rows[key];
    real[key] = {
      value: row ? row.value : null,
      updatedAt: row?.updatedAt ?? null,
    };
  }
  return <AdminConfigView real={real} />;
}
