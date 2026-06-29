"use client";
// Modal real para que un OWNER asigne staff de club (manager/coach/empleado) a
// una persona, dentro de su club. Incluye búsqueda de usuario + selección de rol
// + ACEPTACIÓN DE TÉRMINOS obligatoria (RBAC Stage 2, mig 159). El grant queda en
// el audit log. Reusa assignRole/searchUsers/getRoleGrantTerms.
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import { assignRole, searchUsers, getRoleGrantTerms } from "@/server/actions/roles";

const STAFF_ROLES = [
  { k: "manager", l: "Manager", desc: "Operación, clientes, finanzas y configuración del club." },
  { k: "coach", l: "Coach", desc: "Da clases en el club." },
  { k: "employee", l: "Empleado", desc: "Recepción, caja, atención." },
];

type Found = { id: string; username: string; display_name: string };

export function AssignStaffModal({ clubId, onClose }: { clubId: string; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [selectedUser, setSelectedUser] = useState<Found | null>(null);
  const [role, setRole] = useState("coach");
  const [terms, setTerms] = useState<{ text: string; version: string } | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [searching, startSearch] = useTransition();
  const [submitting, startSubmit] = useTransition();

  useEffect(() => {
    let alive = true;
    getRoleGrantTerms().then((res) => {
      if (alive && res.ok) setTerms(res.data);
    });
    return () => {
      alive = false;
    };
  }, []);

  const doSearch = () => {
    if (query.trim().length < 1) return;
    startSearch(async () => {
      const res = await searchUsers({ q: query });
      if (res.ok) setResults(res.data);
      else toast({ icon: "alert-triangle", title: "Error buscando", sub: res.error.message });
    });
  };

  const doSubmit = () => {
    if (!selectedUser) return toast({ icon: "alert-triangle", title: "Selecciona un usuario" });
    if (!accepted || !terms) return toast({ icon: "alert-triangle", title: "Debes aceptar los términos" });
    startSubmit(async () => {
      const res = await assignRole({ userId: selectedUser.id, role, clubId, termsVersion: terms.version });
      if (res.ok) {
        toast({ icon: "check", title: `${selectedUser.display_name} ahora es ${role} del club` });
        router.refresh();
        onClose();
      } else {
        toast({ icon: "alert-triangle", title: "No se pudo asignar", sub: res.error.message });
      }
    });
  };

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,10,10,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "mpFade 200ms cubic-bezier(0.16,1,0.3,1)" }}>
      <div onMouseDown={(e) => e.stopPropagation()} className="card" style={{ padding: 0, width: 480, maxWidth: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", animation: "mpPop 220ms cubic-bezier(0.16,1,0.3,1)" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="font-heading" style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase", margin: 0 }}>Asignar staff<span className="dot">.</span></h2>
          <button onClick={onClose} aria-label="Cerrar" className="mp-close-btn"><Icon name="x" size={15} /></button>
        </div>

        <div style={{ padding: 22, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Usuario */}
          <div>
            <div className="label-mp" style={{ marginBottom: 6 }}>Persona</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doSearch()} placeholder="Buscar por nombre o @username…" style={{ flex: 1, padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12.5, outline: "none" }} />
              <button className="btn" onClick={doSearch} disabled={searching} style={{ background: "#fff", border: "1px solid var(--border)" }}>Buscar</button>
            </div>
            {selectedUser ? (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: "#ecfdf5", border: "1px solid rgba(16,185,129,0.25)" }}>
                <Icon name="check-circle-2" size={14} color="#047857" />
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>{selectedUser.display_name} <span style={{ color: "var(--muted-fg)" }}>@{selectedUser.username}</span></span>
                <button onClick={() => setSelectedUser(null)} style={{ background: "transparent", border: 0, color: "var(--muted-fg)", cursor: "pointer", textDecoration: "underline", fontSize: 11 }}>cambiar</button>
              </div>
            ) : (
              results.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4, maxHeight: 150, overflow: "auto" }}>
                  {results.map((u) => (
                    <button key={u.id} onClick={() => { setSelectedUser(u); setResults([]); }} style={{ textAlign: "left", padding: "8px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5 }}>
                      {u.display_name} <span style={{ color: "var(--muted-fg)" }}>@{u.username}</span>
                    </button>
                  ))}
                </div>
              )
            )}
          </div>

          {/* Rol */}
          <div>
            <div className="label-mp" style={{ marginBottom: 6 }}>Rol</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {STAFF_ROLES.map((r) => {
                const on = role === r.k;
                return (
                  <button key={r.k} onClick={() => setRole(r.k)} style={{ textAlign: "left", padding: "10px 12px", borderRadius: 9, border: "1px solid " + (on ? "#0a0a0a" : "var(--border)"), background: on ? "#0a0a0a" : "#fff", color: on ? "#fff" : "#0a0a0a", cursor: "pointer", fontFamily: "inherit" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.04em" }}>{r.l}</div>
                    <div style={{ fontSize: 10.5, color: on ? "rgba(255,255,255,0.6)" : "var(--muted-fg)", marginTop: 2 }}>{r.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Términos */}
          <div style={{ padding: 12, borderRadius: 10, background: "#fffbeb", border: "1px solid #fde68a" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
              <Icon name="shield-alert" size={14} color="#92400e" />
              <span className="label-mp" style={{ color: "#78350f" }}>Responsabilidad</span>
            </div>
            <p style={{ fontSize: 11.5, color: "#78350f", lineHeight: 1.5, margin: 0 }}>{terms ? terms.text : "Cargando términos…"}</p>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 10, cursor: terms ? "pointer" : "default" }}>
              <input type="checkbox" checked={accepted} disabled={!terms} onChange={(e) => setAccepted(e.target.checked)} style={{ marginTop: 2 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#0a0a0a" }}>Acepto y entiendo que soy responsable del acceso que le doy a esta persona.</span>
            </label>
          </div>
        </div>

        <div style={{ padding: "12px 22px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose} style={{ background: "#fff", border: "1px solid var(--border)" }}>Cancelar</button>
          <button className="btn btn-primary" onClick={doSubmit} disabled={submitting || !selectedUser || !accepted}>
            <Icon name="user-plus" size={13} color="#fff" />Asignar
          </button>
        </div>
      </div>
    </div>
  );
}
