// ReservarCanchaDrawer — migrado 1:1 desde ui_kits/dashboard/ClubesActionsModals.jsx (líneas 50-214)
// Drawer slide-in desde la derecha. Escucha 'mp-open-reservar' con detail = { name, city, price, sport }
"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

type Club = { name: string; city?: string; price?: number; sport?: string };

const HOURS = ["18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30"];
const TAKEN = new Set(["18:30", "20:00"]);
const DAY_NAMES_ES = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const MONTH_SHORT_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

type DayOption = {
  label: string;     // "HOY" / "LUN" / "MAR" …
  dateNum: string;   // "12"
  monthShort: string; // "may"
  iso: string;       // "2026-05-17"
};

// Construye N días consecutivos desde hoy hacia adelante. Nunca retrocede:
// si hoy es domingo, la lista arranca en domingo y avanza, no muestra el
// viernes pasado.
function buildUpcomingDays(count = 7): DayOption[] {
  const out: DayOption[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push({
      label: i === 0 ? "HOY" : DAY_NAMES_ES[d.getDay()],
      dateNum: String(d.getDate()),
      monthShort: MONTH_SHORT_ES[d.getMonth()],
      iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    });
  }
  return out;
}
const INVITE_AVATARS = [
  "linear-gradient(135deg,#10b981,#047857)",
  "linear-gradient(135deg,#0a0a0a,#374151)",
  "linear-gradient(135deg,#7c3aed,#db2777)",
];

export function ReservarCanchaDrawer() {
  const [open, setOpen] = useState(false);
  const [club, setClub] = useState<Club | null>(null);
  const [day, setDay] = useState(0);
  const [court, setCourt] = useState(3);
  const [time, setTime] = useState("19:30");
  const [done, setDone] = useState(false);
  const [enter, setEnter] = useState(false);
  // Construido una sola vez al montar para no derivar fechas en cada render.
  const [days] = useState<DayOption[]>(() => buildUpcomingDays(7));
  const selectedDay = days[day] ?? days[0];

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<Partial<Club>>).detail;
      const c: Club = detail?.name
        ? { name: detail.name, city: detail.city, price: detail.price, sport: detail.sport }
        : { name: "Club Norte Pickleball", city: "Cumbayá · 4 canchas outdoor", price: 14 };
      setClub(c);
      setOpen(true);
      setDay(0);
      setCourt(3);
      setTime("19:30");
      setDone(false);
    };
    window.addEventListener("mp-open-reservar", handler);
    return () => window.removeEventListener("mp-open-reservar", handler);
  }, []);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => setEnter(true));
      return () => cancelAnimationFrame(id);
    }
    setEnter(false);
  }, [open]);

  if (!open || !club) return null;
  const close = () => setOpen(false);
  const price = (club.price || 14) * 1.5;

  return (
    <div
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,10,0.45)",
        zIndex: 1000,
        display: "flex",
        justifyContent: "flex-end",
        fontFamily: "inherit",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460,
          maxWidth: "100%",
          height: "100%",
          background: "#fff",
          boxShadow: "-12px 0 32px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          transform: enter ? "none" : "translateX(100%)",
          transition: "transform 0.3s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <div
          style={{
            padding: "18px 22px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div>
            <div className="label-mp" style={{ color: "var(--primary)" }}>
              ● {done ? "Reserva confirmada" : "Reserva rápida"}
            </div>
            <div
              className="font-heading"
              style={{
                fontSize: 17,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
              }}
            >
              {club.name}
              <span style={{ color: "var(--primary)" }}>.</span>
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--muted-fg)",
                marginTop: 2,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Icon name="map-pin" size={10} />
              {club.city || "Cumbayá"}
            </div>
          </div>
          <button
            onClick={close}
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "var(--muted)",
              border: 0,
              cursor: "pointer",
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        {!done ? (
          <>
            <div style={{ padding: "16px 22px", overflow: "auto", flex: 1 }}>
              <div className="label-mp" style={{ marginBottom: 8 }}>
                1 · Día
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                {days.map((opt, i) => (
                  <button
                    key={opt.iso}
                    onClick={() => setDay(i)}
                    style={{
                      flex: 1,
                      padding: "8px 4px",
                      borderRadius: 8,
                      border: day === i ? "2px solid var(--primary)" : "1px solid var(--border)",
                      background: day === i ? "#ecfdf5" : "#fff",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        color: "var(--muted-fg)",
                        letterSpacing: "0.1em",
                      }}
                    >
                      {opt.label}
                    </div>
                    <div
                      className="font-heading"
                      style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em" }}
                    >
                      {opt.dateNum}
                    </div>
                  </button>
                ))}
              </div>

              <div className="label-mp" style={{ marginBottom: 8 }}>
                2 · Cancha
              </div>
              <div style={{ display: "flex", gap: 5, marginBottom: 14 }}>
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => setCourt(n)}
                    style={{
                      flex: 1,
                      padding: "7px 4px",
                      borderRadius: 8,
                      border: court === n ? "2px solid var(--primary)" : "1px solid var(--border)",
                      background: court === n ? "#ecfdf5" : "#fff",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    C{n}
                  </button>
                ))}
              </div>

              <div className="label-mp" style={{ marginBottom: 8 }}>
                3 · Hora · <span style={{ color: "var(--muted-fg)" }}>90 min</span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4,1fr)",
                  gap: 6,
                  marginBottom: 14,
                }}
              >
                {HOURS.map((h) => {
                  const isSel = h === time;
                  const isTaken = TAKEN.has(h);
                  return (
                    <button
                      key={h}
                      disabled={isTaken}
                      onClick={() => setTime(h)}
                      style={{
                        padding: "9px 4px",
                        borderRadius: 8,
                        fontFamily: "inherit",
                        border: isSel
                          ? "2px solid var(--primary)"
                          : "1px solid " + (isTaken ? "var(--border)" : "rgba(16,185,129,0.3)"),
                        background: isSel ? "var(--primary)" : isTaken ? "#fafafa" : "#ecfdf5",
                        color: isSel ? "#fff" : isTaken ? "var(--muted-fg)" : "#065f46",
                        cursor: isTaken ? "not-allowed" : "pointer",
                        fontSize: 11.5,
                        fontWeight: 900,
                        textDecoration: isTaken ? "line-through" : "none",
                      }}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>

              <div className="label-mp" style={{ marginBottom: 8 }}>
                4 · Invitar jugadores · <span style={{ color: "var(--muted-fg)" }}>opcional</span>
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                {["CA", "JM", "AR"].map((i, idx) => (
                  <div
                    key={i}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      background: INVITE_AVATARS[idx],
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 9.5,
                      fontWeight: 900,
                      fontFamily: "Plus Jakarta Sans",
                    }}
                  >
                    {i}
                  </div>
                ))}
                <button
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    background: "#fff",
                    border: "1.5px dashed var(--border)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="plus" size={12} />
                </button>
                <span
                  style={{
                    fontSize: 10.5,
                    color: "var(--muted-fg)",
                    alignSelf: "center",
                    marginLeft: 4,
                  }}
                >
                  3 / 4 jugadores
                </span>
              </div>

              <div style={{ padding: 14, background: "#0a0a0a", color: "#fff", borderRadius: 10 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 8,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 800 }}>
                      {selectedDay.label} {selectedDay.dateNum} {selectedDay.monthShort} · {time}
                    </div>
                    <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.6)" }}>
                      Cancha {court} · 90 min
                    </div>
                  </div>
                  <div
                    className="font-heading"
                    style={{
                      fontSize: 22,
                      fontWeight: 900,
                      letterSpacing: "-0.02em",
                      color: "var(--primary)",
                    }}
                  >
                    ${price.toFixed(2)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 5, fontSize: 9.5, color: "rgba(255,255,255,0.6)" }}>
                  <span>
                    ${(price * 0.67).toFixed(0)} cancha + ${(price * 0.33).toFixed(0)} com.
                  </span>
                  <span style={{ marginLeft: "auto" }}>
                    Dividir entre 4 · ${(price / 4).toFixed(2)} c/u
                  </span>
                </div>
              </div>
            </div>

            <div
              style={{
                padding: "14px 22px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                gap: 8,
              }}
            >
              <button
                className="btn"
                style={{ background: "#fff", border: "1px solid var(--border)" }}
              >
                <Icon name="layers" size={13} />
                Más opciones
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => setDone(true)}
              >
                <Icon name="lock" size={13} color="#fff" />
                Confirmar y pagar
              </button>
            </div>
          </>
        ) : (
          <div
            style={{
              padding: 26,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              flex: 1,
              overflow: "auto",
            }}
          >
            <div
              style={{
                padding: "20px 18px",
                borderRadius: 12,
                background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 60%, #10b981 100%)",
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
                  fontSize: 130,
                  color: "rgba(255,255,255,0.07)",
                  letterSpacing: "-0.06em",
                  lineHeight: 0.8,
                  transform: "rotate(-6deg) translate(15%, -15%)",
                  textTransform: "uppercase",
                }}
              >
                BOOK
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center", position: "relative" }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="check-check" size={22} color="#fff" />
                </div>
                <div>
                  <div className="label-mp" style={{ color: "rgba(255,255,255,0.7)" }}>
                    Reserva #RV-2614
                  </div>
                  <div
                    className="font-heading"
                    style={{
                      fontSize: 18,
                      fontWeight: 900,
                      letterSpacing: "-0.02em",
                      textTransform: "uppercase",
                    }}
                  >
                    ¡Cancha reservada!
                    <span style={{ color: "#fbbf24" }}>.</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: 14 }}>
              {(
                [
                  ["Club", club.name],
                  ["Cancha", "Cancha " + court + " · Outdoor"],
                  ["Fecha", `${selectedDay.label} ${selectedDay.dateNum} ${selectedDay.monthShort}`],
                  ["Hora", time + " · 90 min"],
                  ["Pago", "$" + price.toFixed(2) + " · Visa ··4886"],
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
            </div>

            <div className="label-mp">Próximos pasos</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { i: "users", l: "Invitar jugadores", primary: true },
                { i: "calendar-plus", l: "Agregar a calendario" },
                { i: "share-2", l: "Compartir" },
                { i: "file-text", l: "Recibo · PDF" },
              ].map((a) => (
                <button
                  key={a.l}
                  className="card"
                  style={{
                    padding: 11,
                    textAlign: "left",
                    cursor: "pointer",
                    border: a.primary ? "2px solid var(--primary)" : undefined,
                    background: a.primary ? "#ecfdf5" : "#fff",
                    fontFamily: "inherit",
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: a.primary ? "var(--primary)" : "var(--muted)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 6,
                    }}
                  >
                    <Icon name={a.i} size={12} color={a.primary ? "#fff" : "#0a0a0a"} />
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 900 }}>{a.l}</div>
                </button>
              ))}
            </div>

            <button
              className="btn btn-primary"
              style={{ marginTop: "auto", justifyContent: "center" }}
              onClick={close}
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
