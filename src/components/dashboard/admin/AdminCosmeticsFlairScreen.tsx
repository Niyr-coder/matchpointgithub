// Admin · Flair de usuarios — server passthrough.
// El rediseño nuevo (mig 1:1 del kit ui_kits/dashboard/AdminFlairUsuariosScreen.jsx)
// es 100% client + demo data. No requiere fetch server-side por ahora.
//
// La versión anterior cableaba grant/revoke real de cosmetic_bundles + edición
// de precio + activar/desactivar temas. Esas server actions siguen en
// `src/server/actions/admin/cosmetics.ts` y la pantalla anterior vive en
// `AdminCosmeticsScreen.tsx` (sin ruta asignada). Ver
// `docs/guides/04-placeholders.md` para el plan de re-wire.
import { AdminFlairUsuariosView } from "./AdminFlairUsuariosView";

export function AdminCosmeticsFlairScreen() {
  return <AdminFlairUsuariosView />;
}
