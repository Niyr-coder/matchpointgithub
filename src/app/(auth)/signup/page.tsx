import { redirect } from "next/navigation";

// Standalone /signup replaced by the AuthModal on the landing.
export default async function SignUpRedirect({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const qs = new URLSearchParams({ auth: "signup", ...(next ? { next } : {}) });
  redirect(`/?${qs.toString()}`);
}
