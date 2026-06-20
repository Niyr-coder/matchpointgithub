"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import { createPartner } from "@/server/actions/partners";
import { searchUsers } from "@/server/actions/roles";

type FoundUser = { id: string; username: string; display_name: string };

function slugifyPartner(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base.length >= 3 ? base : "partner-org";
}

export function CreatePartnerModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoundUser[]>([]);
  const [owner, setOwner] = useState<FoundUser | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [searching, startSearch] = useTransition();
  const [submitting, startSubmit] = useTransition();

  useEffect(() => {
    if (!slugTouched) setSlug(slugifyPartner(name));
  }, [name, slugTouched]);

  const doSearch = () => {
    const q = query.trim();
    if (q.length < 1) return;
    startSearch(async () => {
      const res = await searchUsers({ q });
      if (res.ok) setResults(res.data);
      else toast({ icon: "alert-triangle", title: "Error buscando", sub: res.error.message });
    });
  };

  const submit = () => {
    if (!owner) {
      toast({ icon: "alert-triangle", title: "Selecciona un owner" });
      return;
    }
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast({ icon: "alert-triangle", title: "Nombre obligatorio", sub: "Mínimo 2 caracteres." });
      return;
    }
    startSubmit(async () => {
      const res = await createPartner({
        name: trimmed,
        slug: slug.trim() || slugifyPartner(trimmed),
        ownerUserId: owner.id,
        contactEmail: contactEmail.trim() || undefined,
      });
      if (res.ok) {
        toast({
          icon: "check",
          title: "Partner creado",
          sub: `${res.data.name} · owner ${owner.display_name}`,
        });
        router.refresh();
        onClose();
      } else {
        toast({ icon: "alert-triangle", title: "No se pudo crear", sub: res.error.message });
      }
    });
  };

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(10,10,10,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="card"
        style={{
          padding: 0,
          width: 520,
          maxWidth: "100%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 className="font-heading" style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase", margin: 0 }}>
            Nuevo partner<span className="dot">.</span>
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--muted-fg)" }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div style={{ padding: 22, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div className="label-mp" style={{ marginBottom: 6 }}>Owner · usuario registrado</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSearch()}
                placeholder="Buscar por nombre o @username…"
                style={{ flex: 1, padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12.5, outline: "none", fontFamily: "inherit" }}
              />
              <button type="button" className="btn" onClick={doSearch} disabled={searching} style={{ background: "#fff", border: "1px solid var(--border)" }}>
                Buscar
              </button>
            </div>
            {owner ? (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: "#ecfdf5", border: "1px solid rgba(16,185,129,0.25)" }}>
                <Icon name="check-circle-2" size={14} color="#047857" />
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>
                  {owner.display_name} <span style={{ color: "var(--muted-fg)" }}>@{owner.username}</span>
                </span>
                <button type="button" onClick={() => setOwner(null)} style={{ background: "transparent", border: 0, color: "var(--muted-fg)", cursor: "pointer", fontSize: 11, textDecoration: "underline" }}>
                  cambiar
                </button>
              </div>
            ) : (
              results.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflow: "auto" }}>
                  {results.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setOwner(u);
                        setResults([]);
                        if (!name.trim()) setName(`${u.display_name} Partner`);
                      }}
                      style={{ textAlign: "left", padding: "8px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5 }}
                    >
                      {u.display_name} <span style={{ color: "var(--muted-fg)" }}>@{u.username}</span>
                    </button>
                  ))}
                </div>
              )
            )}
          </div>

          <div>
            <div className="label-mp" style={{ marginBottom: 6 }}>Nombre del partner</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej. Federación Manabí Pickleball"
              style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12.5, outline: "none", fontFamily: "inherit" }}
            />
          </div>

          <div>
            <div className="label-mp" style={{ marginBottom: 6 }}>Slug público</div>
            <input
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              placeholder="federacion-manabi"
              style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12.5, outline: "none", fontFamily: "inherit" }}
            />
          </div>

          <div>
            <div className="label-mp" style={{ marginBottom: 6 }}>Email de contacto (opcional)</div>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="contacto@organizador.com"
              style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12.5, outline: "none", fontFamily: "inherit" }}
            />
          </div>
        </div>

        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={submitting || !owner}>
            <Icon name="plus" size={13} color="#fff" />
            {submitting ? "Creando…" : "Crear partner"}
          </button>
        </div>
      </div>
    </div>
  );
}
