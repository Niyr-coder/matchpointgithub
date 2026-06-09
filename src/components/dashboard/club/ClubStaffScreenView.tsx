// Client view de ClubStaffScreen — layout 1:1 (RoleScreens2.jsx 180-212).
"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { RSHeader } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { assignRole, revokeRole, searchUsers } from "@/server/actions/roles";
import { createShift, deleteShift, listShifts, type ShiftLite } from "@/server/actions/shifts";

export type StaffMember = {
  id: string;
  assignmentId: string;
  name: string;
  role: string;
  roleKey: string;
  av: string;
  avBg: string;
  avatarUrl: string | null;
};
export type StaffData = { clubId: string | null; staff: StaffMember[] };

const PLACEHOLDER_COUNT = 6;

function StaffCard({
  s,
  onFire,
  onConfigure,
  busy,
}: {
  s: StaffMember;
  onFire: (s: StaffMember) => void;
  onConfigure: (s: StaffMember) => void;
  busy: boolean;
}) {
  const isOwner = s.roleKey === "owner";
  return (
    <div className="card" style={{ padding: 16, position: "relative" }}>
      <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
        <div style={{ position: "relative" }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: s.avatarUrl ? `url(${s.avatarUrl}) center/cover` : s.avBg,
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Plus Jakarta Sans",
              fontWeight: 900,
              fontSize: 13,
            }}
          >
            {s.avatarUrl ? "" : s.av}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="font-heading"
            style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.015em" }}
          >
            {s.name}
          </div>
          <div
            style={{
              fontSize: 10.5,
              color: "var(--primary)",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {s.role}
          </div>
        </div>
      </div>
      <div className="mp-tournament-form-grid-2" style={{ gap: 6, marginTop: 12 }}>
        <div style={{ padding: 8, background: "var(--muted)", borderRadius: 6 }}>
          <div className="label-mp">Horario</div>
          <div style={{ fontSize: 10.5, fontWeight: 800, marginTop: 3, color: "var(--muted-fg)" }}>
            —
          </div>
        </div>
        <div style={{ padding: 8, background: "var(--muted)", borderRadius: 6 }}>
          <div className="label-mp">Sueldo · mes</div>
          <div
            className="font-heading"
            style={{ fontSize: 13, fontWeight: 900, marginTop: 3, color: "var(--muted-fg)" }}
          >
            $—
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <button
          onClick={() => onConfigure(s)}
          className="btn"
          style={{
            flex: 1,
            background: "#fff",
            border: "1px solid var(--border)",
            fontSize: 10.5,
          }}
          disabled={busy}
        >
          <Icon name="settings-2" size={11} />
          Configurar
        </button>
        <button
          onClick={() => onFire(s)}
          className="btn"
          style={{
            flex: 1,
            background: "#fff",
            border: "1px solid var(--border)",
            color: isOwner ? "var(--muted-fg)" : "#dc2626",
            fontSize: 10.5,
            cursor: isOwner ? "not-allowed" : "pointer",
            opacity: isOwner ? 0.5 : 1,
          }}
          disabled={busy || isOwner}
          title={isOwner ? "El dueño del club no puede ser despedido aquí" : "Despedir"}
        >
          <Icon name="user-minus" size={11} color={isOwner ? "var(--muted-fg)" : "#dc2626"} />
          Despedir
        </button>
      </div>
    </div>
  );
}

function StaffPlaceholder() {
  return (
    <div
      style={{
        padding: 16,
        background: "#fafafa",
        border: "1px dashed var(--border)",
        borderRadius: 12,
        opacity: 0.6,
      }}
    >
      <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "var(--muted)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--muted-fg)",
            fontFamily: "Plus Jakarta Sans",
            fontWeight: 900,
            fontSize: 13,
          }}
        >
          —
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="font-heading"
            style={{
              fontSize: 14,
              fontWeight: 900,
              letterSpacing: "-0.015em",
              color: "var(--muted-fg)",
            }}
          >
            Sin personal
          </div>
          <div
            style={{
              fontSize: 10.5,
              color: "var(--muted-fg)",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            —
          </div>
        </div>
      </div>
      <div className="mp-tournament-form-grid-2" style={{ gap: 6, marginTop: 12 }}>
        <div style={{ padding: 8, background: "var(--muted)", borderRadius: 6 }}>
          <div className="label-mp">Horario</div>
          <div style={{ fontSize: 10.5, fontWeight: 800, marginTop: 3, color: "var(--muted-fg)" }}>
            —
          </div>
        </div>
        <div style={{ padding: 8, background: "var(--muted)", borderRadius: 6 }}>
          <div className="label-mp">Sueldo · mes</div>
          <div
            className="font-heading"
            style={{ fontSize: 13, fontWeight: 900, marginTop: 3, color: "var(--muted-fg)" }}
          >
            $—
          </div>
        </div>
      </div>
    </div>
  );
}

export function ClubStaffScreenView({ data }: { data: StaffData }) {
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [hireOpen, setHireOpen] = useState(false);
  const [configTarget, setConfigTarget] = useState<StaffMember | null>(null);
  const [busy, startTransition] = useTransition();

  const handleHire = () => {
    if (!data.clubId) {
      toast({ icon: "alert-triangle", title: "Sin club activo" });
      return;
    }
    setHireOpen(true);
  };

  const handleFire = async (s: StaffMember) => {
    const ok = await confirm({
      title: `Despedir a ${s.name}`,
      body: `Le quitarás el rol "${s.role}" y perderá acceso al portal del club. La acción es reversible recontratándolo.`,
      confirmLabel: "Despedir",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await revokeRole({ assignmentId: s.assignmentId });
      if (res.ok) toast({ icon: "check", title: `${s.name} fue despedido` });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  const handleConfigure = (s: StaffMember) => {
    if (!data.clubId) {
      toast({ icon: "alert-triangle", title: "Sin club activo" });
      return;
    }
    setConfigTarget(s);
  };

  useRealtimeRefresh(
    data.clubId ? [{ table: "role_assignments", filter: `club_id=eq.${data.clubId}` }] : [],
    { enabled: !!data.clubId },
  );

  const hasReal = data.staff.length > 0;

  const closeHire = () => setHireOpen(false);

  return (
    <>
      <RSHeader
        label="Club · Personal"
        title={
          <>
            Equipo del club <span className="dot">●</span> {data.staff.length}
          </>
        }
        action={
          <button className="btn btn-primary" onClick={handleHire} disabled={!data.clubId}>
            <Icon name="user-plus" size={13} color="#fff" />
            Contratar
          </button>
        }
      />
      <div className="mp-tournament-form-grid-3">
        {hasReal
          ? data.staff.map((s) => (
              <StaffCard
                key={s.assignmentId}
                s={s}
                onFire={handleFire}
                onConfigure={handleConfigure}
                busy={busy}
              />
            ))
          : Array.from({ length: PLACEHOLDER_COUNT }).map((_, k) => <StaffPlaceholder key={k} />)}
      </div>
      {hireOpen && data.clubId && (
        <HireStaffModal clubId={data.clubId} onClose={closeHire} />
      )}
      {configTarget && data.clubId && (
        <StaffShiftsOverlay
          clubId={data.clubId}
          staff={configTarget}
          onClose={() => setConfigTarget(null)}
        />
      )}
    </>
  );
}

// ── StaffShiftsOverlay ──────────────────────────────────────────────────
// Gestor de turnos por miembro del staff. Usa `shifts` (migration 032).
// Lista próximos turnos + form para crear uno nuevo + delete inline.
function StaffShiftsOverlay({
  clubId,
  staff,
  onClose,
}: {
  clubId: string;
  staff: StaffMember;
  onClose: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [shifts, setShifts] = useState<ShiftLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [startsAt, setStartsAt] = useState<string>("09:00");
  const [endsAt, setEndsAt] = useState<string>("13:00");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const role: "employee" | "manager" | "coach" =
    staff.roleKey === "manager" || staff.roleKey === "coach"
      ? staff.roleKey
      : "employee";

  const refresh = async () => {
    setLoading(true);
    const res = await listShifts({ clubId, userId: staff.id, limit: 50 });
    if (res.ok) setShifts(res.data);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, staff.id]);

  const handleCreate = async () => {
    if (submitting) return;
    const startIso = new Date(`${date}T${startsAt}:00`).toISOString();
    const endIso = new Date(`${date}T${endsAt}:00`).toISOString();
    if (new Date(endIso) <= new Date(startIso)) {
      toast({ icon: "alert-triangle", title: "Fin debe ser después del inicio" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await createShift({
        clubId,
        userId: staff.id,
        role,
        startsAt: startIso,
        endsAt: endIso,
        notes: notes.trim() || undefined,
      });
      if (res.ok) {
        toast({ icon: "check", title: "Turno creado" });
        setNotes("");
        await refresh();
        router.refresh();
      } else {
        const msg =
          res.error.code === "SHIFTS.OVERLAP"
            ? "Se solapa con otro turno de esta persona"
            : res.error.message;
        toast({ icon: "alert-triangle", title: "No se pudo crear", sub: msg });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      const res = await deleteShift({ id });
      if (res.ok) {
        setShifts((prev) => prev.filter((s) => s.id !== id));
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "No se pudo eliminar", sub: res.error.message });
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 24,
          maxWidth: 560,
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div className="label-mp">Turnos · {staff.role}</div>
            <h3
              className="font-heading"
              style={{
                margin: "4px 0 0",
                fontSize: 20,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
              }}
            >
              {staff.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{ background: "transparent", border: 0, fontSize: 22, cursor: "pointer", lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            padding: 14,
            border: "1px solid var(--border)",
            borderRadius: 12,
            marginBottom: 16,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800 }}>Crear turno</div>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 8 }}>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={shiftInputStyle}
            />
            <input
              type="time"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              style={shiftInputStyle}
            />
            <input
              type="time"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              style={shiftInputStyle}
            />
          </div>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas (opcional)"
            maxLength={500}
            style={shiftInputStyle}
          />
          <button
            onClick={handleCreate}
            disabled={submitting}
            className="btn btn-primary"
            style={{ alignSelf: "flex-end", opacity: submitting ? 0.6 : 1 }}
          >
            <Icon name="plus" size={13} color="#fff" />
            {submitting ? "Creando…" : "Crear turno"}
          </button>
        </div>

        <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Próximos turnos</div>
        {loading ? (
          <SkeletonRows rows={4} />
        ) : shifts.length === 0 ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--muted-fg)",
              padding: 16,
              textAlign: "center",
              border: "1px dashed var(--border)",
              borderRadius: 10,
            }}
          >
            Sin turnos programados.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {shifts.map((sh) => (
              <ShiftRow
                key={sh.id}
                shift={sh}
                deleting={deletingId === sh.id}
                onDelete={() => handleDelete(sh.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const shiftInputStyle: React.CSSProperties = {
  padding: "9px 11px",
  border: "1px solid var(--border)",
  borderRadius: 9,
  fontFamily: "inherit",
  fontSize: 13,
  outline: "none",
  background: "#fff",
};

function ShiftRow({
  shift,
  deleting,
  onDelete,
}: {
  shift: ShiftLite;
  deleting: boolean;
  onDelete: () => void;
}) {
  const s = new Date(shift.startsAt);
  const e = new Date(shift.endsAt);
  const fmt = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const day = s.toLocaleDateString("es-EC", { weekday: "short", day: "numeric", month: "short" });
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 12px",
        border: "1px solid var(--border)",
        borderRadius: 10,
        gap: 10,
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          {day} · {fmt(s)} – {fmt(e)}
        </div>
        {shift.notes && (
          <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>{shift.notes}</div>
        )}
      </div>
      <button
        onClick={onDelete}
        disabled={deleting}
        title="Eliminar"
        style={{
          background: "transparent",
          border: 0,
          color: "#b91c1c",
          cursor: deleting ? "default" : "pointer",
          fontSize: 11,
          fontWeight: 800,
          opacity: deleting ? 0.5 : 1,
        }}
      >
        {deleting ? "Borrando…" : "Eliminar"}
      </button>
    </div>
  );
}

type FoundUser = { id: string; username: string; display_name: string };
type StaffRole = "employee" | "coach" | "manager";

const ROLE_OPTIONS: { k: StaffRole; label: string; sub: string; color: string }[] = [
  { k: "employee", label: "Recepción", sub: "Check-in, walk-ins, cobros", color: "#10b981" },
  { k: "coach", label: "Coach", sub: "Da clases en el club", color: "#f59e0b" },
  { k: "manager", label: "Manager", sub: "Operación diaria completa", color: "#0ea5e9" },
];

function HireStaffModal({ clubId, onClose }: { clubId: string; onClose: () => void }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoundUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<FoundUser | null>(null);
  const [role, setRole] = useState<StaffRole>("employee");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounce search: 250 ms tras la última pulsación.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 1) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      const res = await searchUsers({ q: term });
      if (res.ok) setResults(res.data);
      else setResults([]);
      setSearching(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const doHire = () => {
    if (!selected) return;
    startTransition(async () => {
      const res = await assignRole({ userId: selected.id, role, clubId });
      if (res.ok) {
        toast({ icon: "check", title: "Contratado", sub: selected.display_name });
        onClose();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,10,0.55)",
        backdropFilter: "blur(4px)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ padding: 0, overflow: "hidden", width: 540, maxWidth: "100%" }}
      >
        <div
          style={{
            padding: "16px 22px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h3
            className="font-heading"
            style={{
              fontSize: 16,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "-0.015em",
              margin: 0,
            }}
          >
            Contratar personal<span className="dot">.</span>
          </h3>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "var(--muted)",
              border: 0,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              lineHeight: 1,
            }}
            aria-label="Cerrar"
          >
            <Icon name="x" size={13} />
          </button>
        </div>

        <div style={{ padding: 22 }}>
          <div className="label-mp" style={{ marginBottom: 6 }}>
            1. Busca al usuario
          </div>
          <div style={{ position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--muted-fg)",
              }}
            >
              <Icon name="search" size={14} />
            </span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
              placeholder="@username o nombre"
              style={{
                width: "100%",
                padding: "10px 12px 10px 36px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontFamily: "inherit",
                fontSize: 13,
              }}
            />
          </div>

          <div style={{ marginTop: 10, minHeight: 100 }}>
            {selected ? (
              <div
                style={{
                  padding: 12,
                  borderRadius: 8,
                  border: "2px solid var(--primary)",
                  background: "#ecfdf5",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "var(--primary)",
                    color: "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "Plus Jakarta Sans",
                    fontWeight: 900,
                    fontSize: 12,
                  }}
                >
                  {selected.display_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 900 }}>{selected.display_name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>@{selected.username}</div>
                </div>
                <button
                  onClick={() => {
                    setSelected(null);
                    inputRef.current?.focus();
                  }}
                  style={{
                    border: 0,
                    background: "transparent",
                    cursor: "pointer",
                    color: "var(--muted-fg)",
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  Cambiar
                </button>
              </div>
            ) : searching ? (
              <div style={{ padding: 14, color: "var(--muted-fg)", fontSize: 12 }}>Buscando…</div>
            ) : query.trim() === "" ? (
              <div
                style={{
                  padding: 14,
                  textAlign: "center",
                  fontSize: 11,
                  color: "var(--muted-fg)",
                  border: "1px dashed var(--border)",
                  borderRadius: 8,
                  background: "#fafafa",
                }}
              >
                Empieza a escribir para ver sugerencias.
              </div>
            ) : results.length === 0 ? (
              <div
                style={{
                  padding: 14,
                  textAlign: "center",
                  fontSize: 11,
                  color: "var(--muted-fg)",
                  border: "1px dashed var(--border)",
                  borderRadius: 8,
                  background: "#fafafa",
                }}
              >
                Sin resultados para “{query}”.
              </div>
            ) : (
              <div
                style={{
                  maxHeight: 220,
                  overflowY: "auto",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
              >
                {results.map((u, i) => (
                  <button
                    key={u.id}
                    onClick={() => setSelected(u)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      background: "#fff",
                      border: 0,
                      borderTop: i === 0 ? 0 : "1px solid var(--border)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        background: "var(--muted)",
                        color: "#0a0a0a",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "Plus Jakarta Sans",
                        fontWeight: 900,
                        fontSize: 11,
                        flexShrink: 0,
                      }}
                    >
                      {u.display_name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800 }}>{u.display_name}</div>
                      <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>@{u.username}</div>
                    </div>
                    <Icon name="arrow-right" size={12} color="var(--muted-fg)" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="label-mp" style={{ marginTop: 16, marginBottom: 6 }}>
            2. Rol
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {ROLE_OPTIONS.map((opt) => {
              const on = role === opt.k;
              return (
                <button
                  key={opt.k}
                  onClick={() => setRole(opt.k)}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    border: on ? `2px solid ${opt.color}` : "1px solid var(--border)",
                    background: on ? "#fff" : "#fafafa",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 900, color: on ? opt.color : "#0a0a0a" }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 3 }}>
                    {opt.sub}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div
          style={{
            padding: "14px 22px",
            background: "#fafafa",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            onClick={onClose}
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)" }}
          >
            Cancelar
          </button>
          <button
            onClick={doHire}
            disabled={!selected || isPending}
            className="btn btn-primary"
          >
            <Icon name="user-plus" size={12} color="#fff" />
            {isPending ? "Contratando…" : "Contratar"}
          </button>
        </div>
      </div>
    </div>
  );
}
