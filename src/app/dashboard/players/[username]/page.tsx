// Vista pública del perfil de un jugador.
// URL canónica: /dashboard/players/<username> (más linkable y compartible
// que un UUID). Reusa el mismo ProfileScreenView que /dashboard/user/perfil
// con viewerMode="public" — exactamente la "VISTA PÚBLICA" que el user
// puede previewar en su Mi Perfil.
import { notFound, redirect } from "next/navigation";
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { ProfileScreenView } from "@/components/dashboard/user/ProfileScreenView";
import { loadProfileFor } from "@/components/dashboard/user/ProfileScreen";

export default async function PublicPlayerProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const supabase = await getServerClient();
  const { data: meta } = await supabase
    .from("profiles")
    .select("id,is_system" as never)
    .eq("username", username)
    .maybeSingle();
  const profile = meta as { id?: string; is_system?: boolean } | null;
  if (!profile?.id) notFound();
  if (profile.is_system) {
    // El perfil oficial MATCHPOINT no tiene página pública (no es jugador).
    notFound();
  }

  // Si el viewer es el dueño del perfil, lo mandamos a la versión editable.
  const session = await getSession();
  if (session.authenticated && session.session.userId === profile.id) {
    redirect("/dashboard/user/perfil");
  }

  const data = await loadProfileFor(profile.id);
  return <ProfileScreenView data={data} viewerMode="public" />;
}
