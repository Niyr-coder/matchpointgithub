"use client";
import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import type { SectionToast } from "./_shared";
import {
  addPayoutAccount,
  removePayoutAccount,
  setPrimaryAccount,
  updatePaymentMethods,
  updatePayoutSchedule,
} from "@/server/actions/club-config-pagos";

export type PayoutAccount = {
  id: string;
  bankCode: string;
  bankName: string;
  accountLast4: string;
  holderName: string;
  accountType: "savings" | "checking";
  isPrimary: boolean;
  status: "active" | "backup" | "inactive";
};
export type PayoutSchedule = "daily" | "weekly" | "biw" | "manual";
export type PaymentMethods = {
  transfer: boolean;
  deuna: boolean;
  wallet: boolean;
  cash: boolean;
  card: boolean;
  credit_mp: boolean;
};
export type PagosData = {
  clubId?: string;
  accounts: PayoutAccount[];
  schedule: PayoutSchedule;
  minPayoutCents: number;
  paymentMethods: PaymentMethods;
  commissionPct: number;
  monthVolumeCents: number;
  monthCommissionCents: number;
};

const SCHEDULE_OPTS = [
  { k: "daily" as const, l: "Diario", sub: "Cada día hábil · sin mínimo", recommended: false },
  { k: "weekly" as const, l: "Semanal", sub: "Lunes 09:00 · todo el balance", recommended: true },
  { k: "biw" as const, l: "Quincenal", sub: "Días 1 y 16 · todo el balance", recommended: false },
  { k: "manual" as const, l: "Bajo demanda", sub: "Solo cuando lo solicitas", recommended: false },
];

const METHODS_META: { k: keyof PaymentMethods; l: string; icon: string }[] = [
  { k: "transfer", l: "Transferencia", icon: "arrow-left-right" },
  { k: "deuna", l: "DeUna", icon: "smartphone" },
  { k: "wallet", l: "Saldo MP", icon: "wallet" },
  { k: "cash", l: "Efectivo en caja", icon: "banknote" },
  { k: "card", l: "Tarjeta (próximo)", icon: "credit-card" },
  { k: "credit_mp", l: "Crédito MP", icon: "gift" },
];

const DEFAULT_PAGOS: PagosData = {
  accounts: [],
  schedule: "weekly",
  minPayoutCents: 5000,
  paymentMethods: { transfer: true, deuna: true, wallet: true, cash: true, card: false, credit_mp: false },
  commissionPct: 10,
  monthVolumeCents: 0,
  monthCommissionCents: 0,
};

function fmtMoney(cents: number, neg = false): string {
  const dollars = Math.round(Math.abs(cents) / 100);
  return `${neg ? "–" : ""}$${dollars.toLocaleString("en-US")}`;
}

type AddForm = {
  bankCode: string;
  bankName: string;
  accountLast4: string;
  holderName: string;
  accountType: "savings" | "checking";
};

const EMPTY_FORM: AddForm = {
  bankCode: "",
  bankName: "",
  accountLast4: "",
  holderName: "",
  accountType: "savings",
};

export function PagosSection({
  onAction,
  data,
}: {
  onAction: SectionToast;
  data?: PagosData;
}) {
  const initial = data ?? DEFAULT_PAGOS;
  const clubId = data?.clubId;

  const [accounts, setAccounts] = useState<PayoutAccount[]>(initial.accounts);
  const [schedule, setSchedule] = useState<PayoutSchedule>(initial.schedule);
  const [methods, setMethods] = useState<PaymentMethods>(initial.paymentMethods);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<AddForm>(EMPTY_FORM);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const noClub = !clubId;

  function withClub<T>(fn: (id: string) => Promise<T>): Promise<T> | null {
    if (!clubId) {
      onAction("No hay club activo");
      return null;
    }
    return fn(clubId);
  }

  function onChangeSchedule(next: PayoutSchedule) {
    if (next === schedule) return;
    const prev = schedule;
    setSchedule(next);
    startTransition(async () => {
      const res = await withClub((id) => updatePayoutSchedule({ clubId: id, schedule: next }));
      if (!res || res.ok === false) {
        setSchedule(prev);
        onAction("No se pudo actualizar el esquema de payout");
        return;
      }
      onAction(`Esquema · ${next === "biw" ? "Quincenal" : next === "weekly" ? "Semanal" : next === "daily" ? "Diario" : "Bajo demanda"}`);
    });
  }

  function onToggleMethod(key: keyof PaymentMethods) {
    const prev = methods[key];
    const nextMethods = { ...methods, [key]: !prev };
    setMethods(nextMethods);
    startTransition(async () => {
      const res = await withClub((id) => updatePaymentMethods({ clubId: id, key, enabled: !prev }));
      if (!res || res.ok === false) {
        setMethods((m) => ({ ...m, [key]: prev }));
        onAction("No se pudo actualizar el método");
      }
    });
  }

  function onSetPrimary(id: string) {
    if (!clubId) {
      onAction("No hay club activo");
      return;
    }
    const prevAccounts = accounts;
    setAccounts((list) =>
      list.map((a) =>
        a.id === id
          ? { ...a, isPrimary: true, status: "active" }
          : a.isPrimary
            ? { ...a, isPrimary: false, status: "backup" }
            : a,
      ),
    );
    startTransition(async () => {
      const res = await setPrimaryAccount({ clubId, accountId: id });
      if (res.ok === false) {
        setAccounts(prevAccounts);
        onAction("No se pudo activar la cuenta");
        return;
      }
      onAction("Cuenta activada");
    });
  }

  function onRemove(id: string) {
    if (!clubId) return;
    const prevAccounts = accounts;
    setAccounts((list) => list.filter((a) => a.id !== id));
    startTransition(async () => {
      const res = await removePayoutAccount({ clubId, accountId: id });
      if (res.ok === false) {
        setAccounts(prevAccounts);
        onAction(res.error.message ?? "No se pudo eliminar la cuenta");
      } else {
        onAction("Cuenta eliminada");
      }
    });
  }

  async function onSubmitAdd() {
    setFormErr(null);
    if (!clubId) {
      setFormErr("No hay club activo");
      return;
    }
    if (!/^\d{4}$/.test(form.accountLast4)) {
      setFormErr("Los últimos 4 dígitos deben ser numéricos");
      return;
    }
    if (!form.bankCode.trim() || !form.bankName.trim() || !form.holderName.trim()) {
      setFormErr("Completa todos los campos");
      return;
    }
    const res = await addPayoutAccount({ clubId, ...form });
    if (res.ok === false) {
      setFormErr(res.error.message ?? "No se pudo crear la cuenta");
      return;
    }
    const isFirst = accounts.length === 0;
    setAccounts((list) => [
      ...list,
      {
        id: res.data.id,
        bankCode: form.bankCode,
        bankName: form.bankName,
        accountLast4: form.accountLast4,
        holderName: form.holderName,
        accountType: form.accountType,
        isPrimary: isFirst,
        status: isFirst ? "active" : "backup",
      },
    ]);
    setForm(EMPTY_FORM);
    setShowAdd(false);
    onAction("Cuenta añadida");
  }

  return (
    <div className="mp-ccfg-pagos" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <div className="card" style={{ padding: 22, gridColumn: "span 2" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 10, flexWrap: "wrap" }}>
          <div>
            <div className="label-mp">Cuenta receptora</div>
            <h3 className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 0" }}>Dónde recibes tus payouts<span className="dot">.</span></h3>
          </div>
          <button
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10 }}
            onClick={() => {
              if (noClub) {
                onAction("No hay club activo");
                return;
              }
              setShowAdd((v) => !v);
            }}
          >
            <Icon name="plus" size={11} />Añadir cuenta
          </button>
        </div>

        {showAdd && (
          <div style={{ marginBottom: 16, padding: 16, border: "1px solid var(--border)", borderRadius: 12, background: "#fafafa" }}>
            <div className="mp-tournament-form-grid-2">
              <Input label="Código banco (ej. BP)" value={form.bankCode} onChange={(v) => setForm((f) => ({ ...f, bankCode: v.toUpperCase().slice(0, 4) }))} />
              <Input label="Nombre del banco" value={form.bankName} onChange={(v) => setForm((f) => ({ ...f, bankName: v }))} />
              <Input label="Últimos 4 dígitos" value={form.accountLast4} onChange={(v) => setForm((f) => ({ ...f, accountLast4: v.replace(/\D/g, "").slice(0, 4) }))} />
              <Input label="Titular" value={form.holderName} onChange={(v) => setForm((f) => ({ ...f, holderName: v }))} />
              <div>
                <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.02em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Tipo</label>
                <select
                  value={form.accountType}
                  onChange={(e) => setForm((f) => ({ ...f, accountType: e.target.value as "savings" | "checking" }))}
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, fontFamily: "inherit", background: "#fff" }}
                >
                  <option value="savings">Ahorros</option>
                  <option value="checking">Corriente</option>
                </select>
              </div>
            </div>
            {formErr && <div style={{ marginTop: 8, fontSize: 11, color: "#dc2626" }}>{formErr}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10 }} onClick={() => { setShowAdd(false); setFormErr(null); setForm(EMPTY_FORM); }}>Cancelar</button>
              <button className="btn" style={{ background: "var(--primary)", color: "#fff", fontSize: 10 }} onClick={onSubmitAdd}>Guardar cuenta</button>
            </div>
          </div>
        )}

        <div className="mp-ccfg-banks" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {accounts.length === 0 && (
            <div style={{ gridColumn: "span 2", padding: 22, borderRadius: 14, background: "#fafafa", border: "1.5px dashed var(--border)", textAlign: "center", color: "var(--muted-fg)", fontSize: 12 }}>
              Sin cuentas registradas todavía. Agrega una para empezar a recibir payouts.
            </div>
          )}
          {accounts.map((a) => {
            const isActive = a.status === "active" || a.isPrimary;
            return (
              <div key={a.id} style={isActive ? { padding: 22, borderRadius: 14, background: "linear-gradient(135deg, #0a0a0a 0%, #1f2937 100%)", color: "#fff", position: "relative", overflow: "hidden" } : { padding: 22, borderRadius: 14, background: "#fafafa", color: "#0a0a0a", border: "1.5px dashed var(--border)", position: "relative" }}>
                <span style={{ position: "absolute", top: 14, right: 14, padding: "3px 9px", borderRadius: 9999, background: isActive ? "var(--primary)" : "var(--muted)", color: isActive ? "#fff" : "var(--muted-fg)", fontSize: 8.5, fontWeight: 900, letterSpacing: "0.14em" }}>{isActive ? "● ACTIVA" : "○ BACKUP"}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
                  <div style={{ width: 42, height: 28, borderRadius: 5, background: isActive ? "#fff" : "#0a0a0a", color: isActive ? "#0a0a0a" : "#fff", fontSize: 9, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center", letterSpacing: "0.1em" }}>{a.bankCode}</div>
                  <div style={{ fontSize: 12, fontWeight: 800 }}>{a.bankName}</div>
                </div>
                <div className="font-heading tabular" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.05em", marginBottom: 18, color: isActive ? "#fff" : "var(--muted-fg)" }}>···· ···· ···· {a.accountLast4}</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: isActive ? "rgba(255,255,255,0.65)" : "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  <div>
                    <div style={{ fontSize: 8 }}>Titular</div>
                    <div style={{ fontSize: 11, fontWeight: 900, color: isActive ? "#fff" : "#0a0a0a", marginTop: 2, letterSpacing: "0.01em" }}>{a.holderName}</div>
                  </div>
                  {isActive ? (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 8 }}>Tipo</div>
                      <div style={{ fontSize: 11, fontWeight: 900, color: "#fff", marginTop: 2, letterSpacing: "0.01em" }}>{a.accountType === "savings" ? "Ahorros" : "Corriente"}</div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <button onClick={() => onSetPrimary(a.id)} style={{ background: "transparent", border: 0, color: "var(--primary)", fontSize: 10, fontWeight: 900, cursor: "pointer" }}>Activar →</button>
                      <button onClick={() => onRemove(a.id)} title="Eliminar" style={{ background: "transparent", border: 0, color: "var(--muted-fg)", fontSize: 10, fontWeight: 900, cursor: "pointer" }}>×</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div className="label-mp">Esquema de payout</div>
        <h3 className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 14px" }}>Cuándo te depositamos<span className="dot">.</span></h3>
        {SCHEDULE_OPTS.map((o) => {
          const on = schedule === o.k;
          return (
            <button key={o.k} onClick={() => onChangeSchedule(o.k)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, background: on ? "#ecfdf5" : "transparent", border: on ? "1px solid rgba(16,185,129,0.3)" : "1px solid transparent", cursor: "pointer", marginBottom: 6, width: "100%", textAlign: "left", fontFamily: "inherit" }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid", borderColor: on ? "var(--primary)" : "var(--border)", background: on ? "var(--primary)" : "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {on && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 8 }}>{o.l}{o.recommended && <span style={{ fontSize: 8, fontWeight: 900, padding: "2px 6px", borderRadius: 9999, background: "var(--primary)", color: "#fff", letterSpacing: "0.12em" }}>RECOMENDADO</span>}</div>
                <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 1 }}>{o.sub}</div>
              </div>
            </button>
          );
        })}
        <div style={{ marginTop: 6, padding: 12, background: "var(--muted)", borderRadius: 8, fontSize: 10.5, color: "var(--muted-fg)", lineHeight: 1.5 }}>
          Mínimo retiro: <b style={{ color: "#0a0a0a" }}>{fmtMoney(initial.minPayoutCents)}</b>. Por debajo se acumula al siguiente ciclo.
        </div>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div className="label-mp">Comisión MATCHPOINT</div>
        <h3 className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 14px" }}>Lo que cobramos<span className="dot">.</span></h3>
        <div style={{ padding: 16, background: "linear-gradient(135deg, #0a0a0a, #1f2937)", borderRadius: 12, color: "#fff", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="label-mp" style={{ color: "rgba(255,255,255,0.55)" }}>Comisión por transacción</div>
              <div className="font-heading tabular" style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-0.04em", marginTop: 6, color: "var(--primary)" }}>{initial.commissionPct}%</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>Plan Estándar · sin contrato</div>
            </div>
            <Icon name="info" size={18} color="rgba(255,255,255,0.5)" />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, paddingTop: 14, borderTop: "1px dashed rgba(255,255,255,0.15)", fontSize: 10 }}>
            <div>
              <div style={{ color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 800 }}>Vol. 30d</div>
              <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, marginTop: 2 }}>{fmtMoney(initial.monthVolumeCents)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 800 }}>Pagado a MP</div>
              <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, marginTop: 2, color: "#dc2626" }}>{fmtMoney(initial.monthCommissionCents, true)}</div>
            </div>
          </div>
        </div>
        <button className="btn" style={{ width: "100%", background: "#fff", border: "1px solid var(--border)", fontSize: 11 }} onClick={() => onAction("Subir a Plan Pro · próximamente")}><Icon name="trending-up" size={12} />Subir a Plan Pro · 7%</button>

        <div className="label-mp" style={{ marginTop: 20, marginBottom: 10 }}>Métodos de pago aceptados</div>
        <div className="mp-tournament-form-grid-2" style={{ gap: 8 }}>
          {METHODS_META.map((m) => {
            const on = methods[m.k];
            return (
              <button
                key={m.k}
                onClick={() => onToggleMethod(m.k)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 8, background: on ? "#ecfdf5" : "var(--muted)", border: on ? "1px solid rgba(16,185,129,0.2)" : "1px solid transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
              >
                <Icon name={m.icon} size={12} color={on ? "var(--primary)" : "var(--muted-fg)"} />
                <span style={{ fontSize: 10.5, fontWeight: 800, color: on ? "#0a0a0a" : "var(--muted-fg)", flex: 1 }}>{m.l}</span>
                <span style={{ fontSize: 8.5, fontWeight: 900, color: on ? "var(--primary)" : "var(--muted-fg)", letterSpacing: "0.1em" }}>{on ? "● ON" : "○ OFF"}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.02em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, fontFamily: "inherit", background: "#fff" }}
      />
    </div>
  );
}
