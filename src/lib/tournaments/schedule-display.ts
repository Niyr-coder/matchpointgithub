export type TournamentScheduleBlockView = {
  id: string;
  startsAt: string;
  label: string;
  categoryId: string | null;
  notes: string | null;
};

export type ScheduleDayGroup = {
  dayKey: string;
  dayLabel: string;
  items: {
    id: string;
    time: string;
    label: string;
    notes: string | null;
    categoryId: string | null;
    categoryName: string | null;
  }[];
};

function fmtDay(iso: string): { dayKey: string; dayLabel: string; time: string } {
  const d = new Date(iso);
  const dayKey = d.toISOString().slice(0, 10);
  const dayLabel = d.toLocaleDateString("es-EC", {
    weekday: "long",
    day: "2-digit",
    month: "short",
  });
  const time = d.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
  return { dayKey, dayLabel, time };
}

export function groupScheduleBlocks(
  blocks: TournamentScheduleBlockView[],
  categoryNames: Record<string, string>,
): ScheduleDayGroup[] {
  const sorted = [...blocks].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
  const byDay = new Map<string, ScheduleDayGroup>();
  for (const block of sorted) {
    const { dayKey, dayLabel, time } = fmtDay(block.startsAt);
    const group = byDay.get(dayKey) ?? { dayKey, dayLabel, items: [] };
    group.items.push({
      id: block.id,
      time,
      label: block.label,
      notes: block.notes,
      categoryId: block.categoryId,
      categoryName: block.categoryId ? (categoryNames[block.categoryId] ?? null) : null,
    });
    byDay.set(dayKey, group);
  }
  return Array.from(byDay.values());
}

export function filterScheduleForCategory(
  blocks: TournamentScheduleBlockView[],
  categoryId: string | null | undefined,
): TournamentScheduleBlockView[] {
  if (!categoryId) return blocks;
  return blocks.filter((b) => b.categoryId == null || b.categoryId === categoryId);
}
