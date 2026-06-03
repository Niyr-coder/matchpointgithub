import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { ClubGiveawayView } from "@/lib/schemas/club-comms";
import { PublishAnnouncementForm, CreateGiveawayForm, GiveawayRow, ClubFeedPostForm } from "./ClubAnunciosForms";

export type ClubAnunciosOverview = {
  clubId: string;
  clubName: string;
  announcementsConversationId: string | null;
  communityConversationId: string | null;
  followerCount: number;
  vipCount: number;
};

type Props = {
  roleSegment: "owner" | "manager";
  overview: ClubAnunciosOverview;
  giveaways: ClubGiveawayView[];
};

export function ClubAnunciosScreenView({ roleSegment, overview, giveaways }: Props) {
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 20px 48px" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
          Comunicación
        </div>
        <h1 className="font-heading" style={{ fontSize: 28, fontWeight: 900, margin: "6px 0 8px", letterSpacing: "-0.03em" }}>
          Anuncios y sorteos
        </h1>
        <p style={{ fontSize: 14, color: "var(--muted-fg)", margin: 0, maxWidth: 560 }}>
          Publica avisos para seguidores y socios. Los sorteos viven en el canal de anuncios del club.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 24 }}>
        <StatCard label="Seguidores" value={String(overview.followerCount)} icon="users" />
        <StatCard label="Socios VIP activos" value={String(overview.vipCount)} icon="star" />
        <StatCard label="Sorteos" value={String(giveaways.length)} icon="gift" />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 28 }}>
        {overview.announcementsConversationId ? (
          <Link
            href={`/dashboard/${roleSegment}/chat?conv=${overview.announcementsConversationId}`}
            style={linkBtnStyle}
          >
            <Icon name="megaphone" size={14} />
            Ver canal de anuncios
          </Link>
        ) : null}
        {overview.communityConversationId ? (
          <Link
            href={`/dashboard/${roleSegment}/chat?conv=${overview.communityConversationId}`}
            style={linkBtnStyle}
          >
            <Icon name="messages-square" size={14} />
            Chat comunidad VIP
          </Link>
        ) : null}
      </div>

      <div style={{ display: "grid", gap: 20 }}>
        <Panel title="Publicar en el feed" sub="Avisos, fotos, torneos y spotlight en el perfil del club.">
          <ClubFeedPostForm clubId={overview.clubId} />
        </Panel>

        <Panel title="Publicar aviso" sub="Llega a seguidores y socios en el canal de anuncios y en el feed.">
          <PublishAnnouncementForm clubId={overview.clubId} />
        </Panel>

        <Panel title="Crear sorteo" sub="Owner o manager. Elegibilidad configurable.">
          <CreateGiveawayForm clubId={overview.clubId} />
        </Panel>

        <Panel title="Sorteos del club" sub="Sorteo manual cuando cierre la participación.">
          {giveaways.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: 0 }}>Aún no hay sorteos publicados.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {giveaways.map((g) => (
                <GiveawayRow key={g.id} giveaway={g} />
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div style={{ padding: "14px 16px", borderRadius: 14, border: "1px solid var(--border)", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Icon name={icon} size={14} color="var(--muted-fg)" />
        <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {label}
        </span>
      </div>
      <div className="font-heading" style={{ fontSize: 24, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function Panel({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <section style={{ padding: 20, borderRadius: 16, border: "1px solid var(--border)", background: "#fff" }}>
      <h2 style={{ fontSize: 16, fontWeight: 900, margin: "0 0 4px" }}>{title}</h2>
      <p style={{ fontSize: 12, color: "var(--muted-fg)", margin: "0 0 16px" }}>{sub}</p>
      {children}
    </section>
  );
}

const linkBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 14px",
  borderRadius: 9999,
  border: "1px solid var(--border)",
  background: "#fff",
  color: "var(--fg)",
  fontSize: 12,
  fontWeight: 800,
  textDecoration: "none",
};
