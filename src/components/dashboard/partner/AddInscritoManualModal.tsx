"use client";

import { useState, useTransition, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/dashboard/ToastProvider";
import {
  searchPlayersForTournament,
  addRegistrationByPartner,
  addRegistrationsBulkByPartner,
  type PlayerSearchResult,
} from "@/server/actions/partner-tournament-registrations";

// ── tipos ──────────────────────────────────────────────────────────────────

interface Props {
  tournamentId: string;
  modality: string; // 'singles' | 'doubles' | 'mixed_doubles'
  categories: Array<{ id: string; name: string }>;
  entryFeeCents: number;
  paymentPolicy: string; // 'free' | 'prepay' | 'onsite' | 'flexible'
  onClose: () => void;
  onSuccess: () => void;
}

type SlotValue =
  | { kind: "empty" }
  | { kind: "user"; id: string; name: string }
  | { kind: "walkin"; name: string };

// ── constantes ─────────────────────────────────────────────────────────────

const ANIM_OUT_MS = 160;

// ── Parser de "pegar lista" ─────────────────────────────────────────────────
// Singles: una línea = un nombre. Dobles/mixed: una línea = un equipo,
// separado por "/" (fallback ","). Una línea de dobles sin separador se
// marca como error en vez de emparejar por posición — evita desincronizar
// parejas en silencio si hay una línea suelta en medio de la lista.

type BulkParsedEntry = { line: number; names: string[] };
type BulkParseError = { line: number; text: string };

function parseBulkText(
  text: string,
  expectedNames: number,
): { entries: BulkParsedEntry[]; errors: BulkParseError[] } {
  const entries: BulkParsedEntry[] = [];
  const errors: BulkParseError[] = [];
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    if (expectedNames === 1) {
      entries.push({ line: i + 1, names: [line] });
      return;
    }
    let parts = line.split("/").map((p) => p.trim()).filter(Boolean);
    if (parts.length !== 2) {
      parts = line.split(",").map((p) => p.trim()).filter(Boolean);
    }
    if (parts.length !== 2) {
      errors.push({ line: i + 1, text: line });
      return;
    }
    entries.push({ line: i + 1, names: parts });
  });
  return { entries, errors };
}

// ── PlayerSlot ──────────────────────────────────────────────────────────────
// Input de búsqueda debounced + dropdown + pill de selección.

function PlayerSlot({
  slotLabel,
  tournamentId,
  value,
  onChange,
}: {
  slotLabel: string;
  tournamentId: string;
  value: SlotValue;
  onChange: (val: SlotValue) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setResults([]);
        setDropdownOpen(false);
        setHasSearched(false);
        return;
      }
      setSearching(true);
      const res = await searchPlayersForTournament({ tournamentId, query: q });
      setSearching(false);
      setHasSearched(true);
      if (res.ok) {
        setResults(res.data);
        setDropdownOpen(true);
      }
    },
    [tournamentId],
  );

  const handleQueryChange = (q: string) => {
    setQuery(q);
    setHasSearched(false);
    setDropdownOpen(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(q), 300);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const selectUser = (p: PlayerSearchResult) => {
    onChange({ kind: "user", id: p.id, name: p.displayName });
    setQuery("");
    setResults([]);
    setDropdownOpen(false);
    setHasSearched(false);
  };

  const selectWalkin = () => {
    const name = query.trim();
    if (!name) return;
    onChange({ kind: "walkin", name });
    setQuery("");
    setResults([]);
    setDropdownOpen(false);
    setHasSearched(false);
  };

  const deselect = () => {
    onChange({ kind: "empty" });
  };

  // ── Pill cuando hay jugador seleccionado ────────────────────────────────
  if (value.kind !== "empty") {
    return (
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            fontSize: 11,
            color: "var(--muted-fg)",
            marginBottom: 6,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {slotLabel}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid var(--primary)",
            background: "color-mix(in srgb, var(--primary) 8%, transparent)",
          }}
        >
          <span
            style={{
              color: "var(--primary)",
              fontWeight: 700,
              flexShrink: 0,
              fontSize: 13,
            }}
          >
            ✓
          </span>
          <span
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: "var(--fg)",
            }}
          >
            {value.name}
          </span>
          {value.kind === "walkin" && (
            <span
              style={{
                fontSize: 10,
                color: "var(--muted-fg)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "2px 6px",
                flexShrink: 0,
                whiteSpace: "nowrap",
              }}
            >
              Walk-in
            </span>
          )}
          <button
            type="button"
            onClick={deselect}
            aria-label="Quitar jugador"
            style={{
              flexShrink: 0,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--muted-fg)",
              fontSize: 18,
              lineHeight: 1,
              padding: "0 2px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  // ── Input de búsqueda ───────────────────────────────────────────────────
  const showNoResults = hasSearched && results.length === 0 && query.length >= 2;

  return (
    <div style={{ marginBottom: 14, position: "relative" }}>
      <div
        style={{
          fontSize: 11,
          color: "var(--muted-fg)",
          marginBottom: 6,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {slotLabel}
      </div>

      <div style={{ position: "relative" }}>
        <input
          type="text"
          placeholder="Buscar por nombre o username..."
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => {
            if (results.length > 0 || showNoResults) setDropdownOpen(true);
          }}
          onBlur={() => setTimeout(() => setDropdownOpen(false), 200)}
          style={{
            width: "100%",
            padding: "9px 36px 9px 10px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface, #fff)",
            fontSize: 13,
            boxSizing: "border-box",
            color: "var(--fg)",
          }}
        />
        {searching && (
          <span
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 12,
              color: "var(--muted-fg)",
              pointerEvents: "none",
            }}
          >
            …
          </span>
        )}
      </div>

      {/* Dropdown de resultados */}
      {dropdownOpen && (results.length > 0 || showNoResults) && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 3,
            background: "var(--surface, #fff)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            zIndex: 20,
            overflow: "hidden",
          }}
        >
          {results.map((p, idx) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={() => selectUser(p)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "10px 12px",
                background: "none",
                border: "none",
                borderBottom:
                  idx < results.length - 1 ? "1px solid var(--border)" : "none",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: p.avatarUrl
                    ? `url(${p.avatarUrl}) center/cover`
                    : "linear-gradient(135deg,#10b981,#047857)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  color: "#fff",
                  fontWeight: 700,
                }}
              >
                {!p.avatarUrl && p.displayName.slice(0, 2).toUpperCase()}
              </div>
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "var(--fg)",
                }}
              >
                {p.displayName}
              </span>
            </button>
          ))}

          {/* Walk-in solo cuando no hay resultados */}
          {showNoResults && (
            <button
              type="button"
              onMouseDown={selectWalkin}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "10px 12px",
                background: "color-mix(in srgb, var(--primary) 5%, transparent)",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                fontSize: 13,
                color: "var(--primary)",
                fontWeight: 600,
              }}
            >
              + Añadir como walk-in: &ldquo;{query.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── AddInscritoManualModal ──────────────────────────────────────────────────

export function AddInscritoManualModal({
  tournamentId,
  modality,
  categories,
  entryFeeCents,
  paymentPolicy,
  onClose,
  onSuccess,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const slotCount = modality === "singles" ? 1 : 2;
  const [slots, setSlots] = useState<SlotValue[]>(() =>
    Array.from({ length: slotCount }, () => ({ kind: "empty" as const })),
  );
  const [categoryId, setCategoryId] = useState<string>("");

  // ── modo "pegar lista" (walk-ins en lote) ───────────────────────────────
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [bulkText, setBulkText] = useState("");
  const bulkParsed = useMemo(
    () => parseBulkText(bulkText, slotCount),
    [bulkText, slotCount],
  );

  // ── animación de salida ─────────────────────────────────────────────────
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    closeTimerRef.current = setTimeout(() => onClose(), ANIM_OUT_MS);
  }, [closing, onClose]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  // ── acciones ────────────────────────────────────────────────────────────

  const updateSlot = (idx: number, val: SlotValue) => {
    setSlots((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  };

  const categoryOk = categories.length === 0 || categoryId !== "";

  // Todos los slots deben estar completos para poder enviar (modo "uno por uno").
  const canSubmitSingle = slots.every((s) => s.kind !== "empty") && categoryOk;
  // Al menos una línea parseada sin errores pendientes (modo "pegar lista").
  const canSubmitBulk = bulkParsed.entries.length > 0 && bulkParsed.errors.length === 0 && categoryOk;
  const canSubmit = mode === "single" ? canSubmitSingle : canSubmitBulk;

  const handleSubmitSingle = () => {
    const playerIds = slots
      .filter((s): s is { kind: "user"; id: string; name: string } => s.kind === "user")
      .map((s) => s.id);

    const guestNames = slots
      .filter((s): s is { kind: "walkin"; name: string } => s.kind === "walkin")
      .map((s) => s.name);

    startTransition(async () => {
      const res = await addRegistrationByPartner({
        tournamentId,
        playerIds,
        guestNames,
        categoryId: categoryId || null,
      });
      if (!res.ok) {
        toast({
          icon: "alert-triangle",
          title: "Error al inscribir",
          sub: res.error.message,
          tone: "error",
        });
        return;
      }
      toast({ icon: "check", title: "Inscrito añadido" });
      onSuccess();
      router.refresh();
      onClose();
    });
  };

  const handleSubmitBulk = () => {
    startTransition(async () => {
      const res = await addRegistrationsBulkByPartner({
        tournamentId,
        categoryId: categoryId || null,
        entries: bulkParsed.entries.map((e) => ({ names: e.names })),
      });
      if (!res.ok) {
        toast({
          icon: "alert-triangle",
          title: "Error al inscribir el lote",
          sub: res.error.message,
          tone: "error",
        });
        return;
      }
      const { createdCount, skipped } = res.data;
      if (skipped.length === 0) {
        toast({ icon: "check", title: `${createdCount} inscrito${createdCount === 1 ? "" : "s"} añadido${createdCount === 1 ? "" : "s"}` });
      } else {
        toast({
          icon: createdCount === 0 ? "alert-triangle" : "check",
          title: `${createdCount} añadido${createdCount === 1 ? "" : "s"} · ${skipped.length} no entraron por cupo lleno`,
          tone: createdCount === 0 ? "error" : undefined,
        });
      }
      if (createdCount === 0) return;
      onSuccess();
      router.refresh();
      onClose();
    });
  };

  const handleSubmit = () => {
    if (!canSubmit || isPending) return;
    if (mode === "single") handleSubmitSingle();
    else handleSubmitBulk();
  };

  // ── nota de pago ────────────────────────────────────────────────────────

  const showPaymentNote = entryFeeCents > 0 && paymentPolicy !== "free";
  const amountDisplay = (entryFeeCents / 100).toLocaleString("es-EC", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  // ── render ──────────────────────────────────────────────────────────────

  const closingCls = closing ? " aim-closing" : "";

  return (
    <>
      {/*
        Keyframes locales para no contaminar globals.css.
        prefers-reduced-motion: los paneles solo hacen fade (sin transform).
      */}
      <style>{`
        @keyframes aim-backdrop-in  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes aim-backdrop-out { from { opacity: 1; } to { opacity: 0; } }
        @keyframes aim-panel-in  { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes aim-panel-out { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(16px); } }

        .aim-backdrop       { animation: aim-backdrop-in  180ms ease-out both; }
        .aim-backdrop.aim-closing { animation: aim-backdrop-out ${ANIM_OUT_MS}ms ease-out both; }
        .aim-panel          { animation: aim-panel-in  220ms ease-out both; }
        .aim-panel.aim-closing    { animation: aim-panel-out  ${ANIM_OUT_MS}ms ease-out both; }

        @media (prefers-reduced-motion: reduce) {
          .aim-panel         { animation-name: aim-backdrop-in  !important; }
          .aim-panel.aim-closing { animation-name: aim-backdrop-out !important; }
        }
      `}</style>

      {/* Backdrop */}
      <div
        className={`aim-backdrop${closingCls}`}
        onClick={handleClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          zIndex: 100,
        }}
      />

      {/* Centrador (no intercepta clicks) */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 101,
          padding: "20px 16px",
          pointerEvents: "none",
        }}
      >
        {/* Panel del modal */}
        <div
          className={`aim-panel${closingCls}`}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            maxWidth: 500,
            background: "var(--surface, #fff)",
            borderRadius: "var(--radius, 14px)",
            padding: 24,
            maxHeight: "90dvh",
            overflowY: "auto",
            boxShadow: "0 24px 60px rgba(0,0,0,0.2)",
            pointerEvents: "auto",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              marginBottom: 22,
            }}
          >
            <div>
              <div className="label-mp">Inscripción manual</div>
              <h2
                className="font-heading"
                style={{
                  fontSize: 20,
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  margin: "4px 0 0",
                  color: "var(--fg)",
                }}
              >
                Añadir inscrito
                <span style={{ color: "var(--primary)" }}>.</span>
              </h2>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Cerrar"
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "var(--muted)",
                border: 0,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                fontSize: 18,
                color: "var(--muted-fg)",
                marginTop: 2,
              }}
            >
              ×
            </button>
          </div>

          {/* Toggle modo uno-por-uno / pegar lista */}
          <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
            <button
              type="button"
              className="btn"
              onClick={() => setMode("single")}
              style={{
                flex: 1,
                background: mode === "single" ? "var(--primary)" : "#fff",
                color: mode === "single" ? "#000" : "var(--fg)",
                borderColor: mode === "single" ? "var(--primary)" : "var(--border)",
              }}
            >
              Uno por uno
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setMode("bulk")}
              style={{
                flex: 1,
                background: mode === "bulk" ? "var(--primary)" : "#fff",
                color: mode === "bulk" ? "#000" : "var(--fg)",
                borderColor: mode === "bulk" ? "var(--primary)" : "var(--border)",
              }}
            >
              Pegar lista
            </button>
          </div>

          {mode === "single" ? (
            /* Slots de jugadores */
            slots.map((slot, idx) => (
              <PlayerSlot
                key={idx}
                slotLabel={
                  slotCount === 1
                    ? "Jugador"
                    : idx === 0
                      ? "Jugador 1"
                      : "Jugador 2"
                }
                tournamentId={tournamentId}
                value={slot}
                onChange={(val) => updateSlot(idx, val)}
              />
            ))
          ) : (
            /* Pegar lista: solo walk-ins, un nombre (singles) o equipo separado por / (dobles) por línea */
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--muted-fg)",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {slotCount === 1
                  ? "Un nombre por línea"
                  : "Un equipo por línea — separa los 2 nombres con /"}
              </div>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={
                  slotCount === 1
                    ? "Juan Pérez\nMaría González\n..."
                    : "Juan Pérez / María González\nCarlos Ruiz / Ana Torres\n..."
                }
                rows={8}
                style={{
                  width: "100%",
                  padding: "9px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface, #fff)",
                  fontSize: 13,
                  boxSizing: "border-box",
                  color: "var(--fg)",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
              {bulkText.trim() !== "" && (
                <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.6 }}>
                  <span style={{ color: "var(--primary)", fontWeight: 700 }}>
                    {bulkParsed.entries.length} listo{bulkParsed.entries.length === 1 ? "" : "s"} para inscribir
                  </span>
                  {bulkParsed.errors.length > 0 && (
                    <>
                      <span style={{ color: "var(--muted-fg)" }}> · </span>
                      <span style={{ color: "#dc2626", fontWeight: 700 }}>
                        {bulkParsed.errors.length} con error
                      </span>
                      <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "#dc2626" }}>
                        {bulkParsed.errors.map((err) => (
                          <li key={err.line}>
                            Línea {err.line}: &ldquo;{err.text}&rdquo; — falta separador (/ o ,) para dobles
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Selector de categoría */}
          {categories.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--muted-fg)",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Categoría
              </div>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface, #fff)",
                  fontSize: 13,
                  color: categoryId ? "var(--fg)" : "var(--muted-fg)",
                  boxSizing: "border-box",
                }}
              >
                <option value="">Seleccionar categoría...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Nota de cobro pendiente */}
          {showPaymentNote && (
            <div
              style={{
                marginBottom: 18,
                padding: "10px 14px",
                borderRadius: 8,
                background: "color-mix(in srgb, #f59e0b 8%, transparent)",
                border: "1px solid color-mix(in srgb, #f59e0b 30%, transparent)",
                fontSize: 12,
                color: "#92400e",
                lineHeight: 1.55,
              }}
            >
              {mode === "bulk"
                ? `Se creará un cobro pendiente de $${amountDisplay} por cada inscrito para registrar el pago en mostrador.`
                : `Se creará un cobro pendiente de $${amountDisplay} para registrar el pago en mostrador.`}
            </div>
          )}

          {/* Acciones */}
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canSubmit || isPending}
              onClick={handleSubmit}
              style={{
                flex: 1,
                opacity: !canSubmit || isPending ? 0.6 : 1,
                transition: "opacity 150ms var(--ease-out)",
              }}
            >
              {isPending
                ? "Añadiendo…"
                : mode === "bulk" && bulkParsed.entries.length > 0
                  ? `Añadir ${bulkParsed.entries.length} inscrito${bulkParsed.entries.length === 1 ? "" : "s"}`
                  : "Añadir inscrito"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleClose}
              style={{ flexShrink: 0 }}
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
