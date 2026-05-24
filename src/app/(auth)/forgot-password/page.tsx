import type { Metadata } from "next";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Recuperar contraseña · Matchpoint",
  description:
    "Te enviamos un enlace seguro para restablecer tu contraseña.",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  return <ForgotPasswordForm initialEmail={email ?? ""} />;
}
