"use client";

// Listens for `?reset=ok` después del flow de /auth/reset-password y
// dispara el toast "Tu contraseña fue actualizada." una sola vez. Luego
// quita el param de la URL para que un refresh no la vuelva a mostrar.
import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "./ToastProvider";

export function ResetPasswordToast() {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (params.get("reset") !== "ok") return;
    fired.current = true;
    toast({ icon: "log-in", title: "Tu contraseña fue actualizada." });

    const next = new URLSearchParams(params.toString());
    next.delete("reset");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [params, pathname, router, toast]);

  return null;
}
