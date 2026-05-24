// /auth/reset-password layout: same full-bleed centered card as the (auth)
// group. Vive en /auth/* (no en /(auth)/*) porque el redirectTo del email
// de Supabase apunta a la URL pública /auth/reset-password.
import type { ReactNode } from "react";

export default function ResetPasswordLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse at 20% 0%, rgba(16,185,129,0.10), transparent 55%), radial-gradient(ellipse at 80% 100%, rgba(99,102,241,0.10), transparent 55%), #fafafa",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      {children}
    </div>
  );
}
