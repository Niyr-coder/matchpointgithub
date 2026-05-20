// Modal de creación de una Quedada (juego social). Sigue el patrón de overlay
// de EditBioModal/RetarModal: overlay fixed rgba(10,10,10,.7) + card centrada,
// scale-in, cerrar con click afuera o Escape. Guarda con createQuedada.
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { createQuedada } from "@/server/actions/quedadas";

type Format = "americano" | "mexicano" | "round_robin" | "kotc" | "canguil" | "libre";
type MatchMode = "singles" | "doubles";
type Visibility = "open" | "private";

const FORMATS: { k: Format; label: string; sub: string }[] = [
  { k: "americano", label: "Americano", sub: "Rotación de parejas" },
  { k: "mexicano", label: "Mexicano", sub: "Emparejas por nivel" },
  { k: "round_robin", label: "Round Robin", sub: "Todos contra todos" },
  { k: "kotc", label: "Rey de Cancha", sub: "El que gana se queda" },
  { k: "canguil", label: "Canguil", sub: "Pozo / rotación libre" },
  { k: "libre", label: "Libre", sub: "Sin formato fijo" },
];

// Convierte el valor de un <input type="datetime-local"> (hora local, sin zona)
// a ISO con offset, que es lo que pide el schema (.datetime({ offset: true })).
function localToIso(local: string): string {
  // `local` viene como "2026-05-22T19:30" → new Date lo interpreta en hora local.
  const d = new Date(local);
  return d.toISOString();
}

export function CrearQuedadaModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [format, setFormat] = useState<Format>("americano");
  const [matchMode, setMatchMode] = useState<MatchMode>("doubles");
  const [visibility, setVisibility] = useState<Visibility>("open");
  const [startsLocal, setStartsLocal] = useState("");
  const [locationText, setLocationText] = useState("");
  const [maxPlayers, setMaxPlayers] = useState("");
  const [feeUsd, setFeeUsd] = useState("0");
  const [perks, setPerks] = useState("");

  // Cerrar con Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    if (pending) return;
    const t = title.trim();
    if (t.length < 3) {
      toast({ icon: "alert-triangle", title: "Ponle un título", sub: "Mínimo 3 caracteres." });
      return;
    }
    if (!startsLocal) {
      toast({ icon: "alert-triangle", title: "Elige fecha y hora" });
      return;
    }
    const startsAt = localToIso(startsLocal);
    if (Number.isNaN(Date.parse(startsAt))) {
      toast({ icon: "alert-triangle", title: "Fecha inválida" });
      return;
    }

    const feeNum = Math.round(parseFloat(feeUsd || "0") * 100);
    const feeCents = Number.isFinite(feeNum) && feeNum > 0 ? feeNum : 0;
    const maxNum = maxPlayers.trim() ? parseInt(maxPlayers, 10) : null;
    if (maxNum != null && (Number.isNaN(maxNum) || maxNum < 2)) {
      toast({ icon: "alert-triangle", title: "Cupo inválido", sub: "El cupo mínimo es 2." });
      return;
    }

    startTransition(async () => {
      const res = await createQuedada({
        title: t,
        description: description.trim() || undefined,
        format,
        matchMode,
        visibility,
        startsAt,
        locationText: locationText.trim() || undefined,
        maxPlayers: maxNum ?? undefined,
        feeCents,
        perks: perks.trim() || undefined,
      });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo crear", sub: res.error.message });
        return;
      }
      toast({ icon: "party-popper", title: "Quedada creada" });
      onClose();
      router.refresh();
    });
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,10,0.7)",
        backdropFilter: "blur(6px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "inherit",
        animation: "mp-q-fade 160ms var(--ease-out, ease)",
      }}
    >
      <style>{`@keyframes mp-q-fade{from{opacity:0}to{opacity:1}}
        @keyframes mp-q-pop{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}`}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="card"
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "92vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          background: "#fff",
          boxShadow: "0 32px 64px rgba(0,0,0,0.5)",
          animation: "mp-q-pop 180ms var(--ease-out, ease)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "18px 22px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: "linear-gradient(135deg,#10b981,#047857)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name="party-popper" size={16} color="#fff" />
            </div>
            <h2
              className="font-heading"
              style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", margin: 0 }}
            >
              Crear quedada
            </h2>
          </div>
          <button
            onClick={onClose}
            className="btn"
            style={{ background: "transparent", border: 0, padding: 4, color: "var(--muted-fg)" }}
            aria-label="Cerrar"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div className="label-mp" style={{ marginBottom: 6 }}>Título</div>
            <input
              autoFocus
              value={title}
              maxLength={80}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Americano del sábado en Cumbayá"
              style={inputStyle}
            />
          </div>

          <div>
            <div className="label-mp" style={{ marginBottom: 6 }}>Descripción · opcional</div>
            <textarea
              value={description}
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Cuéntale a la gente de qué va la quedada…"
              style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
            />
          </div>

          <div>
            <div className="label-mp" style={{ marginBottom: 8 }}>Formato</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 8 }}>
              {FORMATS.map((f) => {
                const on = format === f.k;
                return (
                  <button
                    key={f.k}
                    type="button"
                    onClick={() => setFormat(f.k)}
                    style={{
                      padding: 11,
                      borderRadius: 10,
                      border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                      background: on ? "#ecfdf5" : "#fff",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 900, color: on ? "#065f46" : "#0a0a0a" }}>{f.label}</div>
                    <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>{f.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div className="label-mp" style={{ marginBottom: 8 }}>Modo</div>
              <div style={{ display: "flex", gap: 6 }}>
                {([
                  { k: "doubles" as const, l: "Dobles", i: "users" },
                  { k: "singles" as const, l: "Singles", i: "user" },
                ]).map((o) => {
                  const on = matchMode === o.k;
                  return (
                    <button
                      key={o.k}
                      type="button"
                      onClick={() => setMatchMode(o.k)}
                      style={{ ...segBtn, ...(on ? segBtnOn : {}) }}
                    >
                      <Icon name={o.i} size={12} color={on ? "#065f46" : "#0a0a0a"} />
                      {o.l}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="label-mp" style={{ marginBottom: 8 }}>Visibilidad</div>
              <div style={{ display: "flex", gap: 6 }}>
                {([
                  { k: "open" as const, l: "Abierta", i: "globe" },
                  { k: "private" as const, l: "Privada", i: "lock" },
                ]).map((o) => {
                  const on = visibility === o.k;
                  return (
                    <button
                      key={o.k}
                      type="button"
                      onClick={() => setVisibility(o.k)}
                      style={{ ...segBtn, ...(on ? segBtnOn : {}) }}
                    >
                      <Icon name={o.i} size={12} color={on ? "#065f46" : "#0a0a0a"} />
                      {o.l}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div className="label-mp" style={{ marginBottom: 6 }}>Fecha y hora</div>
              <input
                type="datetime-local"
                value={startsLocal}
                onChange={(e) => setStartsLocal(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <div className="label-mp" style={{ marginBottom: 6 }}>Lugar · opcional</div>
              <input
                value={locationText}
                maxLength={140}
                onChange={(e) => setLocationText(e.target.value)}
                placeholder="Club, cancha o dirección"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div className="label-mp" style={{ marginBottom: 6 }}>Cupo · opcional</div>
              <input
                type="number"
                min={2}
                max={64}
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(e.target.value)}
                placeholder="Ej. 8"
                style={inputStyle}
              />
            </div>
            <div>
              <div className="label-mp" style={{ marginBottom: 6 }}>Cuota · USD</div>
              <input
                type="number"
                min={0}
                step="0.5"
                value={feeUsd}
                onChange={(e) => setFeeUsd(e.target.value)}
                placeholder="0"
                style={inputStyle}
              />
              <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 5 }}>
                0 = gratis. Si cobras cuota, el jugador sube comprobante.
              </div>
            </div>
          </div>

          <div>
            <div className="label-mp" style={{ marginBottom: 6 }}>Perks · opcional</div>
            <textarea
              value={perks}
              maxLength={280}
              onChange={(e) => setPerks(e.target.value)}
              placeholder="Ej. incluye pelotas, hidratación y snacks"
              style={{ ...inputStyle, minHeight: 56, resize: "vertical" }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 22px",
            borderTop: "1px solid var(--border)",
            background: "#fafafa",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button onClick={onClose} className="btn btn-outline" disabled={pending}>
            Cancelar
          </button>
          <button
            onClick={save}
            className="btn btn-primary"
            disabled={pending}
            style={{ opacity: pending ? 0.6 : 1 }}
          >
            {!pending && <Icon name="party-popper" size={13} color="#fff" />}
            {pending ? "Creando…" : "Crear quedada"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  background: "#fff",
  color: "#0a0a0a",
};

const segBtn: React.CSSProperties = {
  flex: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "9px 6px",
  borderRadius: 9,
  border: "1px solid var(--border)",
  background: "#fff",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 800,
  color: "#0a0a0a",
};

const segBtnOn: React.CSSProperties = {
  border: "2px solid var(--primary)",
  background: "#ecfdf5",
  color: "#065f46",
};
