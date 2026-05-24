import { redirect } from "next/navigation";

// Standalone /login replaced by the AuthModal on the landing.
// Kept as a redirect for deep links / email magic links / bookmarks.
// ?intent=signup permite que CTAs externas (ej. "Únete gratis" del landing)
// aterricen en /login y aún así abran el modal en modo signup, evitando el
// cognitive mismatch "signup CTA → welcome-back copy" (MAT-53 §A2).
export default async function LoginRedirect({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; intent?: string }>;
}) {
  const { next, intent } = await searchParams;
  const auth = intent === "signup" ? "signup" : "signin";
  const qs = new URLSearchParams({ auth, ...(next ? { next } : {}) });
  redirect(`/?${qs.toString()}`);
}
