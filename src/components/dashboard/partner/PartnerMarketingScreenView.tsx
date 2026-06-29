// Client view de PartnerMarketingScreen — layout 1:1 (RoleScreens2.jsx 364-396).
"use client";
import { Icon } from "@/components/Icon";
import { RSHeader } from "../widgets/RS";
import { RHKpi } from "../widgets/RH";
import { useRealtimeRefresh } from "../useRealtimeRefresh";

export type CampaignRow = { id: string; n: string; cost: string; ch: string };
export type ChannelRow = { l: string; pct: number; c: string };

export type MarketingData = {
  partnerId: string | null;
  totalAlcance: number;
  inscritosFromAds: number;
  campaigns: CampaignRow[];
  channels: ChannelRow[];
};

const CAMPAIGN_PLACEHOLDER_COUNT = 3;
const CHANNEL_PLACEHOLDER: ChannelRow[] = [
  { l: "Instagram", pct: 0, c: "var(--muted-fg)" },
  { l: "WhatsApp", pct: 0, c: "var(--muted-fg)" },
  { l: "Email", pct: 0, c: "var(--muted-fg)" },
  { l: "SMS", pct: 0, c: "var(--muted-fg)" },
];

export function PartnerMarketingScreenView({ data }: { data: MarketingData }) {
  useRealtimeRefresh(
    data.partnerId
      ? [{ table: "broadcasts", filter: `partner_id=eq.${data.partnerId}` }]
      : [],
    { enabled: !!data.partnerId },
  );

  const hasCampaigns = data.campaigns.length > 0;
  const hasChannels = data.channels.length > 0;
  const channels = hasChannels ? data.channels : CHANNEL_PLACEHOLDER;

  // KPIs: alcance real, CTR/costo/inscritos no calculables todavía.
  const kpis: { l: string; v: string; d: string; sub?: string }[] = [
    {
      l: "Alcance",
      v: data.totalAlcance > 0 ? data.totalAlcance.toLocaleString("en-US") : "—",
      d: "—",
      sub: data.totalAlcance > 0 ? "destinatarios totales" : "sin tracking aún",
    },
    { l: "CTR", v: "—", d: "—", sub: "sin tracking aún" },
    {
      l: "Inscripciones desde ads",
      v: data.inscritosFromAds > 0 ? String(data.inscritosFromAds) : "—",
      d: "—",
      sub: "sin tracking aún",
    },
    { l: "Costo · inscrito", v: "$—", d: "—", sub: "sin tracking aún" },
  ];

  return (
    <div className="mp-partner-marketing">
      <RSHeader
        label="Partner · Marketing"
        title="Promoción & alcance"
        action={
          <button className="btn btn-primary">
            <Icon name="megaphone" size={13} color="#fff" />
            Boost evento
          </button>
        }
      />
      <div className="mp-partner-home-kpis mp-partner-marketing-kpis">
        {kpis.map((k) => (
          <RHKpi
            key={k.l}
            label={k.l}
            value={k.v}
            sub={k.sub ?? `↑ ${k.d}`}
            accent={k.v === "—" || k.v === "$—" ? "var(--muted-fg)" : undefined}
          />
        ))}
      </div>
      <div className="mp-role-home-split">
        <div className="card" style={{ padding: 20 }}>
          <h2 className="font-heading card-title" style={{ margin: "0 0 12px" }}>
            Campañas activas<span className="dot">.</span>
          </h2>
          {hasCampaigns
            ? data.campaigns.map((c) => (
                <div
                  key={c.id}
                  style={{ padding: "10px 0", borderTop: "1px dashed var(--border)" }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {c.n} <span style={{ color: "var(--primary)" }}>{c.cost}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 2 }}>{c.ch}</div>
                </div>
              ))
            : Array.from({ length: CAMPAIGN_PLACEHOLDER_COUNT }).map((_, k) => (
                <div
                  key={k}
                  style={{
                    padding: "10px 0",
                    borderTop: "1px dashed var(--border)",
                    opacity: 0.6,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      fontWeight: 800,
                      color: "var(--muted-fg)",
                    }}
                  >
                    Sin campañas <span style={{ color: "var(--muted-fg)" }}>$—</span>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 2 }}>—</div>
                </div>
              ))}
        </div>
        <div className="card" style={{ padding: 20 }}>
          <h2 className="font-heading card-title" style={{ margin: "0 0 12px" }}>
            Mejor canal<span className="dot">.</span>
          </h2>
          {channels.map((ch, i) => (
            <div key={`${ch.l}-${i}`} style={{ marginBottom: 10, opacity: hasChannels ? 1 : 0.6 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11.5,
                  marginBottom: 4,
                }}
              >
                <b style={{ color: hasChannels ? "#0a0a0a" : "var(--muted-fg)" }}>{ch.l}</b>
                <span style={{ color: hasChannels ? "#0a0a0a" : "var(--muted-fg)" }}>
                  {hasChannels ? `${ch.pct}%` : "—"}
                </span>
              </div>
              <div
                style={{
                  height: 5,
                  background: "var(--muted)",
                  borderRadius: 9999,
                  overflow: "hidden",
                }}
              >
                <div style={{ height: "100%", width: `${ch.pct}%`, background: ch.c }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
