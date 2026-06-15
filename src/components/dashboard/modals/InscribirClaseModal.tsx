// InscribirClaseModal — migrado 1:1 desde ui_kits/dashboard/CoachingScreens.jsx (líneas 362-506)
// Escucha 'mp-open-inscribir-clase' con detail = Class
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";

type Class = {
  n: string;
  coach: string;
  sport: string;
  day: string;
  time: string;
  dur: string;
  enrolled: number;
  cap: number;
  price: number;
  club: string;
  color: string;
};

type Pack = {
  k: string;
  l: string;
  sub: string;
  sessions: number;
  multiplier: number;
  recommended: boolean;
};

const PACKS: Pack[] = [
  { k: "1", l: "Drop-in · 1 clase", sub: "Probar primero", sessions: 1, multiplier: 1.1, recommended: false },
  { k: "4", l: "Mes · 4 sesiones", sub: "Mejor combo", sessions: 4, multiplier: 1.0, recommended: true },
  { k: "12", l: "Trimestre · 12 sesiones", sub: "Ahorra 15%", sessions: 12, multiplier: 0.85, recommended: false },
];

export function InscribirClaseModal() {
  const [open, setOpen] = useState(false);
  const [cls, setCls] = useState<Class | null>(null);
  const [step, setStep] = useState(0); // 0=elegir paquete, 1=pago, 2=success
  const [pack, setPack] = useState("4");
  const router = useRouter();

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<Class>).detail;
      if (!detail) return;
      setCls(detail);
      setOpen(true);
      setStep(0);
      setPack("4");
    };
    window.addEventListener("mp-open-inscribir-clase", handler);
    return () => window.removeEventListener("mp-open-inscribir-clase", handler);
  }, []);

  if (!open || !cls) return null;
  const close = () => setOpen(false);
  const sel = PACKS.find((p) => p.k === pack)!;
  const total = (cls.price * sel.sessions * sel.multiplier).toFixed(2);
  const totalNum = parseFloat(total);

  return (
    <div
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,10,0.65)",
        backdropFilter: "blur(6px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "inherit",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{
          width: "100%",
          maxWidth: 720,
          maxHeight: "92vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          background: "#fff",
          boxShadow: "0 32px 64px rgba(0,0,0,0.4)",
        }}
      >
        {/* Hero header */}
        <div
          style={{
            padding: "24px 26px",
            background: cls.color || "linear-gradient(135deg, #0a0a0a 0%, #f59e0b 200%)",
            color: "#fff",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              fontFamily: "Plus Jakarta Sans",
              fontWeight: 900,
              fontSize: 180,
              color: "rgba(255,255,255,0.07)",
              letterSpacing: "-0.06em",
              transform: "rotate(-6deg) translate(15%, -25%)",
            }}
          >
            {step === 2 ? "ENROLLED" : "BOOK"}
          </div>
          <button
            onClick={close}
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#fff",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="x" size={13} color="#fff" />
          </button>
          <div className="label-mp" style={{ color: "rgba(255,255,255,0.7)" }}>
            {step === 2 ? "● Inscripción confirmada" : "Inscribirme a clase"}
          </div>
          <h2
            className="font-heading"
            style={{
              fontSize: 26,
              fontWeight: 900,
              letterSpacing: "-0.025em",
              textTransform: "uppercase",
              margin: "4px 0 6px",
            }}
          >
            {cls.n}
            <span style={{ color: "#fbbf24" }}>.</span>
          </h2>
          <div
            style={{
              display: "flex",
              gap: 12,
              fontSize: 12,
              color: "rgba(255,255,255,0.85)",
              flexWrap: "wrap",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Icon name="user" size={11} color="#fff" />
              {cls.coach}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Icon name="calendar" size={11} color="#fff" />
              {cls.day} · {cls.time}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Icon name="map-pin" size={11} color="#fff" />
              {cls.club}
            </span>
          </div>
        </div>

        {step === 0 && <Step0 cls={cls} pack={pack} setPack={setPack} sel={sel} total={total} />}
        {step === 1 && <Step1 sel={sel} total={total} />}
        {step === 2 && <Step2 cls={cls} sel={sel} total={total} />}

        {/* Footer */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            background: "#fafafa",
          }}
        >
          {step === 2 ? (
            <>
              <button
                className="btn"
                style={{ background: "#fff", border: "1px solid var(--border)" }}
                onClick={close}
              >
                Cerrar
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  close();
                  router.push("/dashboard/user/mis-clases");
                }}
              >
                <Icon name="list-checks" size={13} color="#fff" />
                Ver Mis clases
              </button>
            </>
          ) : (
            <>
              <button
                className="btn"
                style={{ background: "#fff", border: "1px solid var(--border)" }}
                onClick={() => (step === 0 ? close() : setStep(0))}
              >
                <Icon name="arrow-left" size={13} />
                {step === 0 ? "Cancelar" : "Atrás"}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => (step === 1 ? setStep(2) : setStep(1))}
              >
                {step === 1 ? (
                  <>
                    <Icon name="lock" size={13} color="#fff" />
                    Pagar ${(totalNum * 1.1).toFixed(2)}
                  </>
                ) : (
                  <>
                    Continuar al pago
                    <Icon name="arrow-right" size={13} color="#fff" />
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Step0({
  cls,
  pack,
  setPack,
  sel,
  total,
}: {
  cls: Class;
  pack: string;
  setPack: (k: string) => void;
  sel: Pack;
  total: string;
}) {
  return (
    <div style={{ padding: 24, overflow: "auto", flex: 1 }}>
      <div className="label-mp" style={{ marginBottom: 12 }}>
        Elige tu paquete
      </div>
      <div className="mp-grid-form-3 gap-2.5">
        {PACKS.map((p) => {
          const on = pack === p.k;
          return (
            <button
              key={p.k}
              onClick={() => setPack(p.k)}
              style={{
                padding: 14,
                borderRadius: 11,
                border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                background: on ? "#ecfdf5" : "#fff",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
                position: "relative",
              }}
            >
              {p.recommended && (
                <span
                  style={{
                    position: "absolute",
                    top: -8,
                    right: 10,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: "#fbbf24",
                    color: "#0a0a0a",
                    fontSize: 8.5,
                    fontWeight: 900,
                    letterSpacing: "0.12em",
                  }}
                >
                  RECOMENDADO
                </span>
              )}
              <div className="label-mp">{p.l}</div>
              <div
                className="font-heading"
                style={{
                  fontSize: 24,
                  fontWeight: 900,
                  marginTop: 6,
                  letterSpacing: "-0.03em",
                  color: on ? "var(--primary)" : "#0a0a0a",
                }}
              >
                ${(cls.price * p.sessions * p.multiplier).toFixed(0)}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>
                ${(cls.price * p.multiplier).toFixed(2)} por sesión
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: on ? "var(--primary)" : "var(--muted-fg)",
                  fontWeight: 800,
                  marginTop: 8,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                {p.sub}
              </div>
            </button>
          );
        })}
      </div>

      <div className="label-mp" style={{ marginTop: 18, marginBottom: 8 }}>
        Resumen
      </div>
      <div className="card" style={{ padding: 14 }}>
        {(
          [
            ["Clase", cls.n],
            ["Coach", cls.coach],
            ["Cuándo", cls.day + " · " + cls.time],
            ["Duración por sesión", cls.dur],
            ["Sesiones incluidas", String(sel.sessions)],
            ["Precio por sesión", "$" + (cls.price * sel.multiplier).toFixed(2)],
          ] as [string, string][]
        ).map(([k, v]) => (
          <div
            key={k}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "6px 0",
              fontSize: 11.5,
              borderTop: "1px dashed var(--border)",
            }}
          >
            <span style={{ color: "var(--muted-fg)" }}>{k}</span>
            <span style={{ fontWeight: 800 }}>{v}</span>
          </div>
        ))}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            paddingTop: 10,
            borderTop: "1.5px solid #0a0a0a",
            marginTop: 6,
          }}
        >
          <span
            className="font-heading"
            style={{
              fontSize: 12,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Total
          </span>
          <span
            className="font-heading"
            style={{
              fontSize: 24,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              color: "var(--primary)",
            }}
          >
            ${total}
          </span>
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          padding: 12,
          background: "#fef3c7",
          borderRadius: 8,
          fontSize: 11,
          color: "#78350f",
          display: "flex",
          gap: 8,
        }}
      >
        <span style={{ flexShrink: 0, marginTop: 1 }}>
          <Icon name="info" size={13} color="#78350f" />
        </span>
        <span>
          Cancelación gratuita hasta 24h antes de cada sesión. Si pierdes una clase, se reagenda en
          la próxima sesión disponible.
        </span>
      </div>
    </div>
  );
}

const PAY_METHODS = [
  { l: "Tarjeta", i: "credit-card", on: true },
  { l: "PayPhone", i: "smartphone", on: false },
  { l: "Transfer", i: "building-2", on: false },
];

function Step1({ sel, total }: { sel: Pack; total: string }) {
  const totalNum = parseFloat(total);
  const fee = (totalNum * 0.1).toFixed(2);
  const final = (totalNum * 1.1).toFixed(2);
  return (
    <div style={{ padding: 24, overflow: "auto", flex: 1 }}>
      <div className="label-mp" style={{ marginBottom: 10 }}>
        Método de pago
      </div>
      <div className="mp-grid-form-3 gap-1.5" style={{ marginBottom: 14 }}>
        {PAY_METHODS.map((p) => (
          <button
            key={p.l}
            style={{
              padding: "11px 8px",
              borderRadius: 9999,
              fontFamily: "inherit",
              fontSize: 11,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              cursor: "pointer",
              background: p.on ? "#0a0a0a" : "#fff",
              color: p.on ? "#fff" : "#0a0a0a",
              border: "1px solid " + (p.on ? "#0a0a0a" : "var(--border)"),
            }}
          >
            <Icon name={p.i} size={12} color={p.on ? "#fff" : "#0a0a0a"} />
            {p.l}
          </button>
        ))}
      </div>
      <div
        style={{
          padding: "10px 12px",
          border: "2px solid var(--primary)",
          borderRadius: 8,
          background: "#ecfdf5",
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: 36,
            height: 24,
            borderRadius: 4,
            background: "linear-gradient(135deg,#1a1f71,#0066b2)",
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            fontWeight: 900,
          }}
        >
          VISA
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 800 }}>•••• 4886 · Camila Aguilar</div>
          <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>Vence 09/28</div>
        </div>
        <Icon name="check-circle-2" size={16} color="var(--primary)" />
      </div>
      <div className="label-mp" style={{ marginTop: 18, marginBottom: 8 }}>
        Resumen final
      </div>
      <div className="card" style={{ padding: 14 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "5px 0",
            fontSize: 11.5,
          }}
        >
          <span>
            {sel.sessions} sesión{sel.sessions > 1 ? "es" : ""}
          </span>
          <b>${total}</b>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "5px 0",
            fontSize: 11.5,
          }}
        >
          <span>Comisión MP · 10%</span>
          <b>${fee}</b>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            paddingTop: 8,
            borderTop: "1px solid #0a0a0a",
            marginTop: 4,
          }}
        >
          <span
            className="font-heading"
            style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}
          >
            A pagar
          </span>
          <span
            className="font-heading"
            style={{ fontSize: 22, fontWeight: 900, color: "var(--primary)" }}
          >
            ${final}
          </span>
        </div>
      </div>
    </div>
  );
}

function Step2({ cls, sel, total }: { cls: Class; sel: Pack; total: string }) {
  const final = (parseFloat(total) * 1.1).toFixed(2);
  return (
    <div style={{ padding: 28, overflow: "auto", flex: 1, textAlign: "center" }}>
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "#ecfdf5",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14,
        }}
      >
        <Icon name="check-check" size={32} color="var(--primary)" />
      </div>
      <h3
        className="font-heading"
        style={{
          fontSize: 26,
          fontWeight: 900,
          letterSpacing: "-0.03em",
          textTransform: "uppercase",
          margin: 0,
        }}
      >
        ¡Inscrita!<span style={{ color: "var(--primary)" }}>.</span>
      </h3>
      <p
        style={{
          fontSize: 13,
          color: "var(--muted-fg)",
          maxWidth: 460,
          margin: "10px auto 18px",
          lineHeight: 1.5,
        }}
      >
        Te enviamos un mensaje al coach <b style={{ color: "#0a0a0a" }}>{cls.coach}</b>. Tu primera
        sesión es{" "}
        <b style={{ color: "#0a0a0a" }}>
          {cls.day} · {cls.time}
        </b>{" "}
        en {cls.club}.
      </p>
      <div
        style={{
          display: "inline-flex",
          gap: 14,
          padding: "12px 18px",
          borderRadius: 10,
          background: "var(--muted)",
          fontSize: 11.5,
          fontWeight: 700,
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="calendar" size={11} />
          {sel.sessions} sesiones
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="wallet" size={11} />${final}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="user" size={11} />
          {cls.coach}
        </span>
      </div>
    </div>
  );
}
