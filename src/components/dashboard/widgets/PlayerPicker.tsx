// PlayerPicker — selector reutilizable de jugadores por username/displayName.
//
// Usado por:
//  · CrearMatchModal (paso 3) — selecciona rival(es) según la modalidad.
//  · RetarModal (cuando no llega rival por evento) — singles 1v1.
//
// Backend: usa la server action `searchUsers` (busca en profiles por
// username/display_name, LIMIT 10). La RLS de profiles filtra los rows
// visibles para el usuario actual. Debounce 250 ms entre teclas.
//
// UX:
//  · Chips de seleccionados arriba con "x" para remover uno.
//  · Input deshabilitado con copy "Tope alcanzado" cuando selected.length >= max.
//  · Avatar placeholder con iniciales del username.
//  · `excludeIds` filtra resultados (típicamente el current user).
"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from "react";
import { Icon } from "@/components/Icon";
import { searchUsers } from "@/server/actions/roles";

export type Player = { id: string; username: string; displayName: string };

type Props = {
  label: string;
  max: number;
  selected: Player[];
  onChange: (players: Player[]) => void;
  excludeIds?: string[];
};

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg,#10b981,#047857)",
  "linear-gradient(135deg,#0a0a0a,#374151)",
  "linear-gradient(135deg,#7c3aed,#db2777)",
  "linear-gradient(135deg,#0891b2,#06b6d4)",
  "linear-gradient(135deg,#ca8a04,#facc15)",
  "linear-gradient(135deg,#dc2626,#fb923c)",
];

function initialsOf(username: string): string {
  const clean = username.replace(/^@/, "").trim();
  if (!clean) return "??";
  // Iniciales: primeras 2 letras del username.
  return clean.slice(0, 2).toUpperCase();
}

function gradientFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

export function PlayerPicker({ label, max, selected, onChange, excludeIds }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Player[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<number | null>(null);
  const reachedMax = selected.length >= max;

  const excludeSet = useMemo(() => {
    const s = new Set<string>();
    for (const id of excludeIds ?? []) s.add(id);
    for (const p of selected) s.add(p.id);
    return s;
  }, [excludeIds, selected]);

  useEffect(() => {
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length === 0 || reachedMax) {
      setResults([]);
      setError(null);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      startTransition(async () => {
        const res = await searchUsers({ q });
        if (!res.ok) {
          setError(res.error.message);
          setResults([]);
          return;
        }
        setError(null);
        setResults(
          res.data
            .filter((r) => !excludeSet.has(r.id))
            .map((r) => ({ id: r.id, username: r.username, displayName: r.display_name })),
        );
      });
    }, 250);
    return () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    };
  }, [query, reachedMax, excludeSet]);

  const add = (p: Player) => {
    if (reachedMax) return;
    onChange([...selected, p]);
    setQuery("");
    setResults([]);
  };

  const remove = (id: string) => {
    onChange(selected.filter((p) => p.id !== id));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <label
          style={{
            fontSize: 10.5,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            color: "#0a0a0a",
          }}
        >
          {label}
        </label>
        <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
          {selected.length} de {max}
        </span>
      </div>

      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {selected.map((p) => (
            <span
              key={p.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 5px 5px 8px",
                borderRadius: 9999,
                background: "#ecfdf5",
                border: "1px solid var(--primary)",
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              <Avatar id={p.id} username={p.username} size={20} fontSize={9} />
              <span>{p.displayName}</span>
              <span style={{ color: "var(--muted-fg)", fontWeight: 600, marginLeft: 2 }}>
                @{p.username}
              </span>
              <button
                type="button"
                onClick={() => remove(p.id)}
                aria-label={`Quitar ${p.displayName}`}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  border: 0,
                  background: "rgba(10,10,10,0.08)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginLeft: 2,
                }}
              >
                <Icon name="x" size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div style={{ position: "relative" }}>
        <span
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--muted-fg)",
            pointerEvents: "none",
          }}
        >
          <Icon name="search" size={13} />
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={reachedMax}
          placeholder={reachedMax ? "Tope alcanzado" : "Busca por username o nombre…"}
          style={{
            ...pickerInput,
            padding: "11px 14px 11px 34px",
            background: reachedMax ? "#fafafa" : "#fff",
            color: reachedMax ? "var(--muted-fg)" : "#0a0a0a",
            cursor: reachedMax ? "not-allowed" : "text",
          }}
        />
      </div>

      {error && (
        <div style={{ fontSize: 11, color: "#dc2626" }}>
          No se pudo buscar: {error}
        </div>
      )}

      {!reachedMax && query.trim().length > 0 && (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 10,
            maxHeight: 220,
            overflow: "auto",
            background: "#fff",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {pending && results.length === 0 && (
            <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--muted-fg)" }}>
              Buscando…
            </div>
          )}
          {!pending && results.length === 0 && (
            <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--muted-fg)" }}>
              Sin resultados.
            </div>
          )}
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => add(p)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 12px",
                border: 0,
                borderBottom: "1px solid var(--border)",
                background: "#fff",
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              <Avatar id={p.id} username={p.username} size={30} fontSize={11} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800 }}>{p.displayName}</div>
                <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>@{p.username}</div>
              </div>
              <Icon name="plus" size={14} color="var(--primary)" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Avatar({
  id,
  username,
  size,
  fontSize,
}: {
  id: string;
  username: string;
  size: number;
  fontSize: number;
}) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: gradientFor(id),
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        flexShrink: 0,
      }}
    >
      <span className="font-heading" style={{ fontSize, fontWeight: 900 }}>
        {initialsOf(username)}
      </span>
    </span>
  );
}

const pickerInput: CSSProperties = {
  width: "100%",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontFamily: "inherit",
  fontSize: 13.5,
  outline: "none",
};
