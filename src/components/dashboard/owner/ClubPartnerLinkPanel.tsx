"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { regenerateClubPartnerLinkCode } from "@/server/actions/clubs";

export function ClubPartnerLinkPanel({
  clubId,
  linkCode,
}: {
  clubId: string;
  linkCode: string | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const { confirm } = usePromptModal();
  const [code, setCode] = useState(linkCode ?? "—");
  const [isPending, startTransition] = useTransition();

  const copyCode = async () => {
    if (!code || code === "—") return;
    try {
      await navigator.clipboard.writeText(code);
      toast({ icon: "check", title: "Código copiado" });
    } catch {
      toast({ icon: "alert-triangle", title: "No se pudo copiar" });
    }
  };

  const onRegenerate = async () => {
    const ok = await confirm({
      title: "Regenerar código",
      body: "El código anterior dejará de funcionar. Los partners vinculados siguen activos; solo cambia el código para nuevas vinculaciones.",
      confirmLabel: "Regenerar",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await regenerateClubPartnerLinkCode({ clubId });
      if (res.ok) {
        setCode(res.data.linkCode);
        toast({ icon: "check", title: "Código actualizado" });
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.55 }}>
        Comparte este código solo con partners de confianza. Ellos lo ingresan en su panel para
        vincular tu club — no necesitan el ID interno.
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <code
          style={{
            fontFamily: "var(--font-mono, ui-monospace, monospace)",
            fontSize: 18,
            fontWeight: 900,
            letterSpacing: "0.06em",
            padding: "10px 14px",
            borderRadius: 10,
            background: "var(--muted)",
            color: "#0a0a0a",
          }}
        >
          {code}
        </code>
        <button type="button" className="btn btn-ghost" onClick={copyCode} disabled={!code || code === "—"}>
          <Icon name="copy" size={13} />
          Copiar
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onRegenerate}
          disabled={isPending}
        >
          <Icon name="refresh-cw" size={13} />
          {isPending ? "Generando…" : "Regenerar"}
        </button>
      </div>
    </div>
  );
}
