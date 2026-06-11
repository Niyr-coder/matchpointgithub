import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PolHero } from "@/components/dashboard/widgets/PolHero";
import type { ClubGiveawayView } from "@/lib/schemas/club-comms";
import { PublishAnnouncementForm, GiveawayRow, ClubFeedPostForm } from "./ClubAnunciosForms";

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
  const sorteosHref = `/dashboard/${roleSegment}/club-sorteos`;

  return (
    <div className="mp-anuncios-root">
      <PolHero
        tone="dark"
        wm="COMMS"
        label={`Club · ${overview.clubName}`}
        title="Anuncios"
        sub="Publica en el feed del club y en el canal de anuncios. Los sorteos se gestionan en la sección Sorteos."
        right={
          <div className="mp-anuncios-hero-actions">
            <div className="mp-anuncios-hero-pair">
              {overview.announcementsConversationId ? (
                <Link
                  href={`/dashboard/${roleSegment}/chat?conv=${overview.announcementsConversationId}`}
                  className="btn mp-anuncios-hero-btn"
                  style={heroBtnStyle}
                >
                  <Icon name="megaphone" size={13} color="#fff" />
                  Anuncios
                </Link>
              ) : null}
              {overview.communityConversationId ? (
                <Link
                  href={`/dashboard/${roleSegment}/chat?conv=${overview.communityConversationId}`}
                  className="btn mp-anuncios-hero-btn"
                  style={heroBtnStyle}
                >
                  <Icon name="messages-square" size={13} color="#fff" />
                  Chat VIP
                </Link>
              ) : null}
            </div>
            <Link href={sorteosHref} className="btn btn-primary mp-anuncios-hero-primary" style={{ textDecoration: "none" }}>
              <Icon name="gift" size={13} color="#fff" />
              Sorteos
            </Link>
          </div>
        }
      />

      <div className="mp-anuncios-kpis">
        <StatCard label="Seguidores" value={String(overview.followerCount)} icon="users" />
        <StatCard label="Socios VIP activos" value={String(overview.vipCount)} icon="star" />
        <StatCard label="Sorteos activos" value={String(giveaways.filter((g) => g.status === "open").length)} icon="gift" />
      </div>

      <div className="mp-anuncios-body">
        <div className="mp-anuncios-compose">
          <Panel title="Publicar en el feed" sub="Avisos, fotos, torneos y spotlight en el perfil público del club.">
            <ClubFeedPostForm clubId={overview.clubId} />
          </Panel>

          <Panel title="Publicar aviso" sub="Llega a seguidores y socios en el canal de anuncios y en el feed.">
            <PublishAnnouncementForm clubId={overview.clubId} />
          </Panel>
        </div>

        <aside className="mp-anuncios-aside">
          <section className="card mp-anuncios-aside-card">
            <h2 className="mp-anuncios-panel-title">Sorteos</h2>
            <p className="mp-anuncios-panel-sub">
              Crea sorteos con mecánicas, entradas ponderadas y sorteo en vivo desde la sección dedicada.
            </p>
            <Link href={sorteosHref} className="btn btn-primary mp-anuncios-sorteos-cta" style={{ textDecoration: "none" }}>
              <Icon name="plus" size={13} color="#fff" />
              Crear sorteo
            </Link>
          </section>

          <Panel title="Sorteos publicados" sub="Sorteos legacy en el canal de anuncios. Para v2, usa Sorteos.">
            {giveaways.length === 0 ? (
              <p className="mp-anuncios-empty">Aún no hay sorteos en el canal.</p>
            ) : (
              <div className="mp-anuncios-giveaway-list">
                {giveaways.map((g) => (
                  <GiveawayRow key={g.id} giveaway={g} />
                ))}
              </div>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="card mp-anuncios-stat">
      <div className="mp-anuncios-stat-head">
        <Icon name={icon} size={14} color="var(--muted-fg)" />
        <span className="mp-anuncios-stat-label">{label}</span>
      </div>
      <div className="font-heading mp-anuncios-stat-value">{value}</div>
    </div>
  );
}

function Panel({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <section className="card mp-anuncios-panel">
      <h2 className="mp-anuncios-panel-title">{title}</h2>
      <p className="mp-anuncios-panel-sub">{sub}</p>
      {children}
    </section>
  );
}

const heroBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.1)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.18)",
  textDecoration: "none",
};
