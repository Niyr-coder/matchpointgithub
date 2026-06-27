import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

const GREEN = "#10b981";
const BLACK = "#0a0a0a";
const GRAY = "#6b7280";
const LIGHT = "#f4f4f5";
const BORDER = "#e4e4e7";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 40,
  },
  // Header
  header: {
    marginBottom: 28,
    borderBottomWidth: 2,
    borderBottomColor: GREEN,
    paddingBottom: 16,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: GREEN,
    marginRight: 5,
  },
  brandLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    letterSpacing: 2,
    color: GREEN,
    textTransform: "uppercase",
  },
  tournamentName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 22,
    color: BLACK,
    letterSpacing: -0.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    gap: 16,
  },
  metaItem: {
    fontSize: 9,
    color: GRAY,
  },
  metaBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: BLACK,
  },
  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    marginTop: 18,
  },
  sectionAccent: {
    width: 3,
    height: 14,
    backgroundColor: GREEN,
    marginRight: 8,
    borderRadius: 2,
  },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    letterSpacing: 1.5,
    color: BLACK,
    textTransform: "uppercase",
  },
  // Schedule block
  blockRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 4,
    marginBottom: 2,
  },
  blockRowAlt: {
    backgroundColor: LIGHT,
  },
  blockTime: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: GREEN,
    width: 56,
    flexShrink: 0,
  },
  blockLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: BLACK,
    flex: 1,
  },
  blockCat: {
    fontSize: 8,
    color: GRAY,
    marginLeft: 8,
  },
  // Match row
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 2,
    borderRadius: 4,
  },
  matchRowAlt: {
    backgroundColor: LIGHT,
  },
  matchNum: {
    fontSize: 8,
    color: GRAY,
    width: 20,
    flexShrink: 0,
  },
  matchVs: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  matchSide: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: BLACK,
    flex: 1,
  },
  matchVsLabel: {
    fontSize: 8,
    color: GRAY,
    marginHorizontal: 6,
  },
  matchTime: {
    fontSize: 8,
    color: GRAY,
    width: 44,
    textAlign: "right",
  },
  matchStatus: {
    fontSize: 7,
    color: "#fff",
    backgroundColor: GREEN,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    marginLeft: 6,
  },
  matchStatusPending: {
    fontSize: 7,
    color: GRAY,
    backgroundColor: BORDER,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    marginLeft: 6,
  },
  // Group label
  groupLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: GRAY,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 10,
    marginBottom: 4,
    paddingLeft: 10,
  },
  // Round label
  roundLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: GRAY,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 10,
    marginBottom: 4,
    paddingLeft: 10,
  },
  // Empty state
  emptyBox: {
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    marginTop: 8,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 9,
    color: GRAY,
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 8,
  },
  footerLeft: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: GREEN,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  footerRight: {
    fontSize: 7,
    color: GRAY,
  },
});

function formatTime(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return null;
  }
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return "—";
  }
}

const ROUND_LABELS: Record<number, string> = {
  0: "Fase Final",
  1: "Final",
  2: "Semifinales",
  4: "Cuartos de final",
  8: "Octavos de final",
  16: "Dieciseisavos",
};

function roundLabel(round: number, total: number): string {
  if (ROUND_LABELS[round]) return ROUND_LABELS[round];
  return `Ronda ${total - round + 1}`;
}

export type PdfScheduleBlock = {
  id: string;
  datetime: string | null;
  label: string;
  category_name?: string | null;
  notes?: string | null;
};

export type PdfMatch = {
  id: string;
  phase: "group" | "bracket";
  round?: number;
  groupName?: string;
  labelA: string;
  labelB: string;
  scheduledAt?: string | null;
  status: string;
};

export type PdfTournamentData = {
  name: string;
  slug: string;
  startsAt: string | null;
  endsAt: string | null;
  sport: string;
  format: string;
  scheduleBlocks: PdfScheduleBlock[];
  matches: PdfMatch[];
  generatedAt: string;
};

export function TournamentSchedulePdf({ data }: { data: PdfTournamentData }) {
  const hasSchedule = data.scheduleBlocks.length > 0;
  const groupMatches = data.matches.filter((m) => m.phase === "group");
  const bracketMatches = data.matches.filter((m) => m.phase === "bracket");
  const hasMatches = data.matches.length > 0;

  // Agrupar partidos de grupo por groupName
  const groupsMap = new Map<string, PdfMatch[]>();
  for (const m of groupMatches) {
    const g = m.groupName ?? "Grupo";
    if (!groupsMap.has(g)) groupsMap.set(g, []);
    groupsMap.get(g)!.push(m);
  }

  // Agrupar bracket por round
  const roundsMap = new Map<number, PdfMatch[]>();
  for (const m of bracketMatches) {
    const r = m.round ?? 0;
    if (!roundsMap.has(r)) roundsMap.set(r, []);
    roundsMap.get(r)!.push(m);
  }
  const sortedRounds = Array.from(roundsMap.keys()).sort((a, b) => a - b);

  return (
    <Document
      title={`Calendario · ${data.name}`}
      author="MATCHPOINT"
      subject="Calendario de partidos"
      creator="MATCHPOINT · matchpoint.top"
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.dot} />
            <Text style={styles.brandLabel}>MATCHPOINT · Calendario de partidos</Text>
          </View>
          <Text style={styles.tournamentName}>{data.name}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaItem}>
              <Text style={styles.metaBold}>Deporte:</Text> {data.sport}
            </Text>
            <Text style={styles.metaItem}>
              <Text style={styles.metaBold}>Formato:</Text> {data.format}
            </Text>
            <Text style={styles.metaItem}>
              <Text style={styles.metaBold}>Inicio:</Text> {formatDate(data.startsAt)}
            </Text>
          </View>
        </View>

        {/* Cronograma de bloques */}
        {hasSchedule && (
          <View>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionAccent} />
              <Text style={styles.sectionTitle}>Cronograma</Text>
            </View>
            {data.scheduleBlocks.map((b, i) => (
              <View
                key={b.id}
                style={[styles.blockRow, i % 2 === 1 ? styles.blockRowAlt : {}]}
              >
                <Text style={styles.blockTime}>{formatTime(b.datetime) ?? "—:——"}</Text>
                <Text style={styles.blockLabel}>{b.label}</Text>
                {b.category_name && (
                  <Text style={styles.blockCat}>{b.category_name}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Partidos de grupos */}
        {groupsMap.size > 0 && (
          <View>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionAccent} />
              <Text style={styles.sectionTitle}>Fase de grupos</Text>
            </View>
            {Array.from(groupsMap.entries()).map(([groupName, matches]) => (
              <View key={groupName}>
                <Text style={styles.groupLabel}>{groupName}</Text>
                {matches.map((m, i) => (
                  <MatchRow key={m.id} match={m} index={i} />
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Partidos de bracket / knockout */}
        {sortedRounds.length > 0 && (
          <View>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionAccent} />
              <Text style={styles.sectionTitle}>Fase eliminatoria</Text>
            </View>
            {sortedRounds.map((round) => {
              const matches = roundsMap.get(round) ?? [];
              return (
                <View key={round}>
                  <Text style={styles.roundLabel}>
                    {roundLabel(round, sortedRounds[sortedRounds.length - 1])}
                  </Text>
                  {matches.map((m, i) => (
                    <MatchRow key={m.id} match={m} index={i} />
                  ))}
                </View>
              );
            })}
          </View>
        )}

        {/* Sin datos */}
        {!hasSchedule && !hasMatches && (
          <View>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionAccent} />
              <Text style={styles.sectionTitle}>Partidos</Text>
            </View>
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                Sin partidos generados aún. Genera el bracket o cronograma desde el panel partner.
              </Text>
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerLeft}>MATCHPOINT · matchpoint.top</Text>
          <Text style={styles.footerRight}>Generado: {data.generatedAt}</Text>
        </View>
      </Page>
    </Document>
  );
}

function MatchRow({ match, index }: { match: PdfMatch; index: number }) {
  const isPlayed = match.status === "played" || match.status === "completed";
  const time = formatTime(match.scheduledAt);
  return (
    <View style={[styles.matchRow, index % 2 === 1 ? styles.matchRowAlt : {}]}>
      <Text style={styles.matchNum}>{String(index + 1).padStart(2, "0")}</Text>
      <View style={styles.matchVs}>
        <Text style={styles.matchSide}>{match.labelA}</Text>
        <Text style={styles.matchVsLabel}>vs</Text>
        <Text style={styles.matchSide}>{match.labelB}</Text>
      </View>
      {time && <Text style={styles.matchTime}>{time}</Text>}
      {isPlayed ? (
        <Text style={styles.matchStatus}>Jugado</Text>
      ) : (
        <Text style={styles.matchStatusPending}>Pendiente</Text>
      )}
    </View>
  );
}
