"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { AuthModal } from "@/components/auth/AuthModal";
import { joinTeamByCode } from "@/server/actions/teams";

export function TeamAuthGate({ code }: { code: string }) {
  const [open, setOpen] = useState(true);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-primary"
        style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)" }}
      >
        <Icon name="log-in" size={14} color="#fff" />
        Unirme al team
      </button>
    );
  }
  return <AuthModal mode="signup" next={`/team/join/${code}`} onClose={() => setOpen(false)} />;
}

export function JoinTeamByCodeClient({ code }: { code: string }) {
  const router = useRouter();
  const fired = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    (async () => {
      const res = await joinTeamByCode({ code });
      if (res.ok) {
        router.replace("/dashboard/user/team");
        return;
      }
      setError(res.error.message || "No pudimos unirte al team.");
    })();
  }, [code, router]);

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--bg, #f7f7f5)",
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 420,
          padding: 32,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div
          aria-hidden
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: error
              ? "#fef2f2"
              : "linear-gradient(135deg, #0a0a0a 0%, #064e3b 60%, #10b981 200%)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={error ? "alert-circle" : "users"} size={22} color={error ? "#dc2626" : "#fff"} />
        </div>

        <div className="label-mp" style={{ color: "var(--muted-fg)" }}>
          ● MATCHPOINT
        </div>

        {error ? (
          <>
            <h1
              className="font-heading"
              style={{
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                textTransform: "uppercase",
                lineHeight: 1.05,
                margin: 0,
              }}
            >
              No pudimos unirte
            </h1>
            <p style={{ fontSize: 14, color: "var(--muted-fg)", margin: 0 }}>{error}</p>
            <button
              type="button"
              onClick={() => router.replace("/dashboard/user/team")}
              className="btn btn-primary"
              style={{ marginTop: 4 }}
            >
              Ir a mi team
            </button>
          </>
        ) : (
          <>
            <h1
              className="font-heading"
              style={{
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                textTransform: "uppercase",
                lineHeight: 1.05,
                margin: 0,
              }}
            >
              Uniéndote al team…
            </h1>
            <p style={{ fontSize: 14, color: "var(--muted-fg)", margin: 0 }}>
              Un momento, estamos confirmando tu inscripción.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
