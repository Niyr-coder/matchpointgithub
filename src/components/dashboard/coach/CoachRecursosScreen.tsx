// Server: biblioteca de recursos del coach (resources + resource_views para usos).
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { CoachRecursosScreenView, type RecursosData, type Resource } from "./CoachRecursosScreenView";

const KIND_COLORS: Record<string, string> = {
  pdf: "linear-gradient(135deg,#dc2626,#fb923c)",
  video: "linear-gradient(135deg,#0c4a6e,#0ea5e9)",
  article: "linear-gradient(135deg,#0a0a0a,#27272a)",
  plan: "linear-gradient(135deg,#064e3b,#10b981)",
  exercise: "linear-gradient(135deg,#fbbf24,#d97706)",
  link: "linear-gradient(135deg,#7c3aed,#db2777)",
};

const KIND_ICONS: Record<string, string> = {
  pdf: "file-text",
  video: "play-circle",
  article: "book-open",
  plan: "list-checks",
  exercise: "clipboard-check",
  link: "link",
};

const KIND_LABELS: Record<string, string> = {
  pdf: "PDF",
  video: "Video",
  article: "Artículo",
  plan: "Programa",
  exercise: "Ejercicio",
  link: "Link",
};

async function loadData(): Promise<RecursosData> {
  const session = await getSession();
  if (!session.authenticated) {
    return { coachId: null, featured: null, items: [], totalUses: 0 };
  }
  const coachId = session.session.userId;
  const supabase = await getServerClient();

  const { data: resources } = await supabase
    .from("resources")
    .select("id,title,description,kind,duration_seconds,created_at")
    .eq("coach_id", coachId)
    .order("created_at", { ascending: false });

  const resIds = (resources ?? []).map((r) => r.id as string);

  const { data: views } = resIds.length > 0
    ? await supabase
        .from("resource_views")
        .select("resource_id")
        .in("resource_id", resIds)
    : { data: [] as { resource_id: string }[] };

  const usesByRes = new Map<string, number>();
  for (const v of views ?? []) {
    const k = v.resource_id as string;
    usesByRes.set(k, (usesByRes.get(k) ?? 0) + 1);
  }

  const all: Resource[] = (resources ?? []).map((r) => {
    const kind = (r.kind as string) ?? "link";
    const duration = (r.duration_seconds as number | null) ?? null;
    const kindLabel = KIND_LABELS[kind] ?? kind;
    let kindMeta = kindLabel;
    if (duration && (kind === "video")) {
      kindMeta = `${kindLabel} · ${Math.round(duration / 60)} min`;
    }
    return {
      id: r.id as string,
      title: r.title as string,
      description: (r.description as string | null) ?? null,
      kind,
      kindLabel: kindMeta,
      icon: KIND_ICONS[kind] ?? "file",
      color: KIND_COLORS[kind] ?? "linear-gradient(135deg,#0a0a0a,#27272a)",
      uses: usesByRes.get(r.id as string) ?? 0,
    };
  });

  const totalUses = all.reduce((s, r) => s + r.uses, 0);

  // Featured: el más usado (o el primero si todos en 0)
  let featured: Resource | null = null;
  if (all.length > 0) {
    const sorted = [...all].sort((a, b) => b.uses - a.uses);
    featured = sorted[0];
  }
  const items = featured ? all.filter((r) => r.id !== featured!.id) : all;

  return { coachId, featured, items, totalUses };
}

export async function CoachRecursosScreen() {
  const data = await loadData();
  return <CoachRecursosScreenView data={data} />;
}
