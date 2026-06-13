"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Icon } from "@/components/Icon";
import { FriendCard, type FriendLite } from "@/components/dashboard/widgets/FriendCard";
import { NameplateMark } from "@/components/dashboard/widgets/NameplateMark";
import { ProfileHeaderCard } from "@/components/dashboard/user/ProfileHeaderCard";
import {
  DEFAULT_NAMEPLATE_KEY,
  NAMEPLATES,
  type NameplateKey,
} from "@/lib/profile/nameplates";

const MOCK_USER = {
  name: "Camila Reyes",
  username: "camila_reyes",
  city: "Quito",
  bio: "Dúo sólido en dobles. Siempre lista para un match competitivo.",
  avatarUrl: null as string | null,
  primaryClub: { name: "Club Cumbayá" },
  memberSince: "2024-03-15T00:00:00.000Z",
};

const PREVIEW_FRIENDS: FriendLite[] = [
  {
    id: "preview-self",
    name: MOCK_USER.name,
    username: MOCK_USER.username,
    city: MOCK_USER.city,
    sport: "pickleball",
    level: 4.2,
    isOfficial: false,
    isPremium: true,
    nameplateKey: DEFAULT_NAMEPLATE_KEY,
    matchesTogether: 8,
    h2hWins: 5,
    h2hLosses: 3,
  },
  {
    id: "preview-competitor",
    name: "Mateo Vélez",
    username: "mateo_velez",
    city: "Quito",
    sport: "pickleball",
    level: 4.5,
    isOfficial: false,
    isPremium: false,
    nameplateKey: "competitor",
    matchesTogether: 12,
    h2hWins: 4,
    h2hLosses: 8,
  },
  {
    id: "preview-support",
    name: "MATCHPOINT EC",
    username: "matchpoint_ec",
    city: "Quito",
    sport: "pickleball",
    level: 0,
    isOfficial: true,
    isPremium: false,
  },
];

const cardStyle: CSSProperties = {
  padding: 20,
  borderRadius: 16,
  border: "1px solid var(--border)",
  background: "var(--card)",
};

export function PersonalizacionCompletaHandoffScreen() {
  const [selected, setSelected] = useState<NameplateKey>(DEFAULT_NAMEPLATE_KEY);

  const previewFriend = useMemo(
    () => ({
      ...PREVIEW_FRIENDS[0],
      nameplateKey: selected,
    }),
    [selected],
  );

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "24px 20px 48px" }}>
      <div style={{ marginBottom: 28 }}>
        <div className="label-mp" style={{ marginBottom: 8 }}>Handoff · personalización</div>
        <h1
          className="font-heading"
          style={{
            margin: 0,
            fontSize: "clamp(28px, 4vw, 36px)",
            fontWeight: 900,
            letterSpacing: "-0.03em",
            textTransform: "uppercase",
          }}
        >
          Remate del nombre
        </h1>
        <p style={{ marginTop: 10, maxWidth: 640, color: "var(--muted-fg)", lineHeight: 1.55, fontSize: 14 }}>
          El nameplate no es un badge ni un pill: es el símbolo oficial que acompaña tu nombre en perfil,
          cards de jugador y roster. El usuario elige entre presets curados por MATCHPOINT.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 0.9fr)",
          gap: 20,
          alignItems: "start",
        }}
        className="mp-nameplate-handoff-grid"
      >
        <section style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Icon name="sparkles" size={15} />
            <h2 className="font-heading" style={{ margin: 0, fontSize: 16, fontWeight: 900, textTransform: "uppercase" }}>
              Elige tu remate
            </h2>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 10,
            }}
          >
            {NAMEPLATES.filter((item) => item.key !== "support").map((item) => {
              const active = selected === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSelected(item.key)}
                  style={{
                    textAlign: "left",
                    padding: "14px 14px 12px",
                    borderRadius: 14,
                    border: active ? "2px solid var(--primary)" : "1px solid var(--border)",
                    background: active ? "rgba(16,185,129,0.06)" : "var(--bg)",
                    cursor: "pointer",
                    transition: "border-color 160ms ease, background 160ms ease",
                  }}
                >
                  <div
                    className="font-heading"
                    style={{
                      fontSize: 18,
                      fontWeight: 900,
                      letterSpacing: "-0.02em",
                      display: "inline-flex",
                      alignItems: "baseline",
                      marginBottom: 8,
                    }}
                  >
                    {MOCK_USER.name.split(" ")[0]}
                    <NameplateMark nameplate={item} size="sm" />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "var(--fg)", marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted-fg)", lineHeight: 1.45 }}>{item.description}</div>
                </button>
              );
            })}
          </div>
          <p style={{ marginTop: 14, fontSize: 12, color: "var(--muted-fg)", lineHeight: 1.5 }}>
            <strong style={{ color: "var(--fg)" }}>Soporte</strong> y otros remates reservados los asigna operación;
            no aparecen en el selector del jugador.
          </p>
        </section>

        <section style={{ display: "grid", gap: 16 }}>
          <div style={cardStyle}>
            <div className="label-mp" style={{ marginBottom: 12 }}>Preview · perfil</div>
            <ProfileHeaderCard
              {...MOCK_USER}
              nameplateKey={selected}
              coverButton={null}
              avatarEditButton={null}
              actions={null}
            />
          </div>

          <div style={cardStyle}>
            <div className="label-mp" style={{ marginBottom: 12 }}>Preview · card de jugador</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              <FriendCard f={previewFriend} index={0} isSuggestion={false} preview />
              <FriendCard f={PREVIEW_FRIENDS[1]} index={1} isSuggestion={false} preview />
              <FriendCard f={PREVIEW_FRIENDS[2]} index={2} isSuggestion={false} preview />
            </div>
          </div>

          <div style={cardStyle}>
            <div className="label-mp" style={{ marginBottom: 12 }}>Preview · roster</div>
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              {[previewFriend, PREVIEW_FRIENDS[1]].map((member, index) => (
                <div
                  key={member.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "12px 14px",
                    borderTop: index > 0 ? "1px solid var(--border)" : undefined,
                    background: index === 0 ? "rgba(16,185,129,0.04)" : "transparent",
                  }}
                >
                  <span
                    className="font-heading"
                    style={{
                      fontWeight: 900,
                      fontSize: 14,
                      display: "inline-flex",
                      alignItems: "baseline",
                      minWidth: 0,
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {member.name}
                    </span>
                    <NameplateMark
                      nameplateKey={member.isOfficial ? "support" : member.nameplateKey}
                      size="sm"
                    />
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      padding: "2px 8px",
                      borderRadius: 9999,
                      background: "var(--muted)",
                      color: "var(--muted-fg)",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      flexShrink: 0,
                    }}
                  >
                    {index === 0 ? "Capitán" : "Miembro"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
