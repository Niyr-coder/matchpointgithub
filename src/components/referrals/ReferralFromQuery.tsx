"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MP_REF_COOKIE, MP_REF_COOKIE_MAX_AGE_SEC } from "@/lib/referrals/constants";

function normalizeRef(raw: string): string | null {
  const slug = raw.trim().toLowerCase();
  if (slug.length < 3 || slug.length > 24) return null;
  if (!/^[a-z0-9_.]+$/.test(slug)) return null;
  return slug;
}

/** Persiste ?ref=username en cookie para reclamar al terminar onboarding. */
export function ReferralFromQuery({ skipWhenAuthenticated }: { skipWhenAuthenticated?: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const refRaw = params.get("ref");

  useEffect(() => {
    if (skipWhenAuthenticated || !refRaw) return;
    const slug = normalizeRef(refRaw);
    if (!slug) return;

    document.cookie = `${MP_REF_COOKIE}=${encodeURIComponent(slug)}; path=/; max-age=${MP_REF_COOKIE_MAX_AGE_SEC}; samesite=lax`;

    const url = new URL(window.location.href);
    url.searchParams.delete("ref");
    router.replace(url.pathname + (url.search || ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refRaw, skipWhenAuthenticated]);

  return null;
}
