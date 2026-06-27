"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useToast } from "@/components/dashboard/ToastProvider";
import {
  adminSearchClubs,
  adminLinkClubToPartner,
} from "@/server/actions/admin/partner-club-links";

type ClubResult = { id: string; name: string; city: string | null; slug: string };

interface Props {
  open: boolean;
  onClose: () => void;
  partnerId: string;
  onSuccess: () => void;
}

export function AdminLinkClubModal({ open, onClose, partnerId, onSuccess }: Props) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClubResult[]>([]);
  const [selected, setSelected] = useState<ClubResult | null>(null);
  const [revenueSharePct, setRevenueSharePct] = useState(0);
  const [searching, setSearching] = useState(false);
  const [submitting, startSubmit] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const res = await adminSearchClubs({ q });
      setSearching(false);
      if (res.ok) setResults(res.data);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  const reset = () => {
    setQuery("");
    setResults([]);
    setSelected(null);
    setRevenueSharePct(0);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = () => {
    if (!selected) return;
    startSubmit(async () => {
      const res = await adminLinkClubToPartner({
        partnerId,
        clubId: selected.id,
        revenueSharePct,
      });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "Error al vincular", sub: res.error.message, tone: "error" });
        return;
      }
      toast({ icon: "check", title: "Club vinculado" });
      reset();
      onSuccess();
      onClose();
    });
  };

  if (!open) return null;

  return (
    <>
      <div className="mp-monitor-sheet-overlay" onClick={handleClose} />
      <div className="mp-monitor-sheet" style={{ maxHeight: "80dvh", overflowY: "auto" }}>
        <div
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: "var(--border)",
            margin: "0 auto 18px",
          }}
        />

        <div style={{ marginBottom: 16 }}>
          <div className="label-mp">Vincular club</div>
          <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 2 }}>
            Busca el club por nombre o slug y define la comisión que recibe el partner.
          </div>
        </div>

        {selected ? (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "2px solid var(--primary)",
              background: "color-mix(in srgb, var(--primary) 8%, transparent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 16,
            }}
          >
            <div>
              <span style={{ fontWeight: 700, fontSize: 13, color: "var(--primary)" }}>
                {selected.name}
              </span>
              {selected.city && (
                <span style={{ fontSize: 12, color: "var(--muted-fg)", marginLeft: 6 }}>
                  {selected.city}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => { setSelected(null); setQuery(""); setResults([]); }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--muted-fg)",
                fontSize: 16,
                lineHeight: 1,
                padding: 2,
              }}
              aria-label="Quitar selección"
            >
              ✕
            </button>
          </div>
        ) : (
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 11,
                color: "var(--muted-fg)",
                marginBottom: 6,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Buscar club
            </div>
            <input
              type="text"
              placeholder="Nombre o slug del club..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface, #fff)",
                fontSize: 13,
                boxSizing: "border-box",
              }}
              autoFocus
            />
            {searching && (
              <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 6 }}>Buscando…</div>
            )}
            {!searching && results.length > 0 && (
              <div
                style={{
                  marginTop: 6,
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                {results.map((club, i) => (
                  <button
                    key={club.id}
                    type="button"
                    onClick={() => { setSelected(club); setQuery(""); setResults([]); }}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      background: "var(--surface, #fff)",
                      border: "none",
                      borderTop: i === 0 ? "none" : "1px solid var(--border)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background 100ms",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--muted)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--surface, #fff)"; }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{club.name}</span>
                    <span style={{ fontSize: 11, color: "var(--muted-fg)", flexShrink: 0 }}>
                      {club.city ?? club.slug}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {!searching && query.trim().length >= 2 && results.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 6 }}>
                Sin resultados para "{query}".
              </div>
            )}
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <label
            style={{
              fontSize: 11,
              color: "var(--muted-fg)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              display: "block",
              marginBottom: 6,
            }}
          >
            Comisión %
          </label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={revenueSharePct}
            onChange={(e) => setRevenueSharePct(Number(e.target.value))}
            style={{
              width: "100%",
              padding: "9px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface, #fff)",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!selected || submitting}
            onClick={handleSubmit}
            style={{ flex: 1 }}
          >
            {submitting ? "Vinculando…" : "Vincular"}
          </button>
          <button type="button" className="btn" onClick={handleClose} style={{ flexShrink: 0 }}>
            Cancelar
          </button>
        </div>
      </div>
    </>
  );
}
