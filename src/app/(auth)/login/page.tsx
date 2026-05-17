import { redirect } from "next/navigation";

// Standalone /login replaced by the AuthModal on the landing.
// Kept as a redirect for deep links / email magic links / bookmarks.
export default async function LoginRedirect({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const qs = new URLSearchParams({ auth: "signin", ...(next ? { next } : {}) });
  redirect(`/?${qs.toString()}`);
}
