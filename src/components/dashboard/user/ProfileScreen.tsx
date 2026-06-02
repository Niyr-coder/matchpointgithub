// Server shell: carga datos y monta ProfileV3. El loader vive en loadProfileFor.server.ts
// para que rutas públicas no importen componentes cliente de este módulo.
import { ProfileV3ScreenView } from "./profile-v3/ProfileV3ScreenView";
import { loadProfileFor } from "./loadProfileFor.server";

export { loadProfileFor } from "./loadProfileFor.server";

export async function ProfileScreen() {
  const data = await loadProfileFor();
  return <ProfileV3ScreenView data={data} />;
}
