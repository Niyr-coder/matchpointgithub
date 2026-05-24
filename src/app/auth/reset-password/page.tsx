import type { Metadata } from "next";
import { getServerClient } from "@/lib/db/client.server";
import { ResetPasswordClient } from "./ResetPasswordClient";

export const metadata: Metadata = {
  title: "Restablece tu contraseña · Matchpoint",
  description: "Crea una nueva contraseña para tu cuenta de Matchpoint.",
  robots: { index: false, follow: false },
};

// /auth/reset-password
//
// Es el destino del link "Restablece tu contraseña" del email Supabase.
//
// Supabase soporta dos shapes del callback:
//   · PKCE (default con @supabase/ssr): ?code=xxx — exchangeable server-side.
//   · Implicit (legacy templates): tokens en hash #access_token=...&type=recovery
//     — el client SDK los detecta automáticamente.
//
// El page hace el exchange PKCE si hay ?code; si no, delega al client para
// que el SDK del browser parsee el hash. Después el client renderiza el form
// y, al submit, llama updatePassword() que ya valida sesión activa.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{
    code?: string;
    error?: string;
    error_code?: string;
    error_description?: string;
  }>;
}) {
  const params = await searchParams;
  let serverError: string | null = null;

  if (params.error_description || params.error) {
    serverError = decodeErrorDescription(
      params.error_description || params.error_code || params.error || "",
    );
  } else if (params.code) {
    const supabase = await getServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) {
      console.error("[reset-password] exchangeCodeForSession failed", error.message);
      serverError =
        "Tu enlace ya no es válido. Es probable que haya expirado o se haya usado.";
    }
  }

  return <ResetPasswordClient serverError={serverError} />;
}

function decodeErrorDescription(raw: string): string {
  // Supabase suele mandar "Email link is invalid or has expired" — lo
  // traducimos a algo accionable en español neutro.
  const lower = raw.toLowerCase();
  if (lower.includes("expired") || lower.includes("invalid")) {
    return "Tu enlace ya no es válido. Es probable que haya expirado o se haya usado.";
  }
  return "No pudimos validar tu enlace. Solicita uno nuevo.";
}
