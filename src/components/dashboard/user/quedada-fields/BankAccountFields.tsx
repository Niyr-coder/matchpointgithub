// Editor de datos bancarios del organizador (Quedadas). Controlado: el padre
// guarda un BankDraft (todo strings) y convierte a PaymentAccount al guardar.
// Compartido entre el wizard de crear y el panel de gestión → misma estructura
// en ambos lados (consistencia).
"use client";

import { useState } from "react";
import { EC_BANKS, ACCOUNT_TYPE_LABEL, type AccountType } from "@/lib/geo/ec-banks";
import type { PaymentAccount } from "@/lib/schemas/quedadas";

export type BankDraft = {
  bank: string;
  accountType: "" | AccountType;
  accountNumber: string;
  holderName: string;
  holderId: string;
  note: string;
};

export const EMPTY_BANK: BankDraft = {
  bank: "",
  accountType: "",
  accountNumber: "",
  holderName: "",
  holderId: "",
  note: "",
};

export function accountToBankDraft(a: PaymentAccount | null | undefined): BankDraft {
  if (!a) return { ...EMPTY_BANK };
  return {
    bank: a.bank ?? "",
    accountType: a.accountType ?? "",
    accountNumber: a.accountNumber ?? "",
    holderName: a.holderName ?? "",
    holderId: a.holderId ?? "",
    note: a.note ?? "",
  };
}

// Devuelve la cuenta solo si los obligatorios están completos; sino null.
export function bankDraftToAccount(d: BankDraft): PaymentAccount | null {
  if (!d.bank.trim() || !d.accountType || !d.accountNumber.trim() || !d.holderName.trim()) return null;
  return {
    bank: d.bank.trim(),
    accountType: d.accountType,
    accountNumber: d.accountNumber.trim(),
    holderName: d.holderName.trim(),
    holderId: d.holderId.trim() || undefined,
    note: d.note.trim() || undefined,
  };
}

// Validación parcial: hay algo escrito pero falta un obligatorio.
export function bankDraftIsIncomplete(d: BankDraft): boolean {
  const anything = d.bank || d.accountType || d.accountNumber || d.holderName;
  return !!anything && bankDraftToAccount(d) === null;
}

const inp: React.CSSProperties = {
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
const lbl: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.02em",
  color: "var(--muted-fg)",
  marginBottom: 5,
  display: "block",
};

const KNOWN_BANKS = EC_BANKS.filter((b) => b !== "Otro");

export function BankAccountFields({
  value,
  onChange,
}: {
  value: BankDraft;
  onChange: (d: BankDraft) => void;
}) {
  const set = (patch: Partial<BankDraft>) => onChange({ ...value, ...patch });
  // "Otro" = banco fuera del catálogo (texto libre). Se siembra del valor inicial.
  const [otro, setOtro] = useState<boolean>(value.bank !== "" && !KNOWN_BANKS.includes(value.bank));
  const selectValue = otro ? "Otro" : KNOWN_BANKS.includes(value.bank) ? value.bank : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={lbl}>Banco</label>
          <select
            value={selectValue}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "Otro") {
                setOtro(true);
                set({ bank: "" });
              } else {
                setOtro(false);
                set({ bank: v });
              }
            }}
            style={{ ...inp, cursor: "pointer" }}
          >
            <option value="">Selecciona…</option>
            {EC_BANKS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={lbl}>Tipo de cuenta</label>
          <div style={{ display: "flex", gap: 6 }}>
            {(["ahorros", "corriente"] as AccountType[]).map((t) => {
              const on = value.accountType === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => set({ accountType: t })}
                  style={{
                    flex: 1,
                    padding: "9px 6px",
                    borderRadius: 9,
                    border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                    background: on ? "#ecfdf5" : "#fff",
                    color: on ? "#065f46" : "#0a0a0a",
                    fontWeight: 800,
                    fontSize: 12,
                    fontFamily: "inherit",
                    cursor: "pointer",
                  }}
                >
                  {ACCOUNT_TYPE_LABEL[t]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {otro && (
        <div>
          <label style={lbl}>Nombre del banco / cooperativa</label>
          <input value={value.bank} onChange={(e) => set({ bank: e.target.value })} placeholder="Escribe el nombre" maxLength={60} style={inp} />
        </div>
      )}

      <div>
        <label style={lbl}>Número de cuenta</label>
        <input value={value.accountNumber} onChange={(e) => set({ accountNumber: e.target.value })} placeholder="2213691106" maxLength={40} inputMode="numeric" style={inp} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={lbl}>Titular</label>
          <input value={value.holderName} onChange={(e) => set({ holderName: e.target.value })} placeholder="Ivette Ponce M." maxLength={80} style={inp} />
        </div>
        <div>
          <label style={lbl}>Cédula / RUC · opcional</label>
          <input value={value.holderId} onChange={(e) => set({ holderId: e.target.value })} placeholder="1312865700" maxLength={20} inputMode="numeric" style={inp} />
        </div>
      </div>

      <div>
        <label style={lbl}>Nota · opcional</label>
        <input value={value.note} onChange={(e) => set({ note: e.target.value })} placeholder="Ej. también DeUna al 0991234567" maxLength={140} style={inp} />
      </div>
    </div>
  );
}
