// Server: detalle admin de un evento o torneo. El id viene prefijado
// "ev-{uuid}" o "tr-{uuid}" desde AdminEventsScreen para distinguir los dos
// tipos dentro de la misma tabla.
import { notFound } from "next/navigation";
import { getEventForAdmin } from "@/server/actions/events";
import { getTournamentForAdmin } from "@/server/actions/tournaments";
import { AdminEventDetailView } from "./AdminEventDetailView";
import { AdminTournamentDetailView } from "./AdminTournamentDetailView";

const UUID = /^[0-9a-f-]{36}$/i;

export async function AdminEventDetail({ id }: { id: string }) {
  if (id.startsWith("ev-")) {
    const rawId = id.slice(3);
    if (!UUID.test(rawId)) notFound();
    const res = await getEventForAdmin({ eventId: rawId });
    if (!res.ok) notFound();
    return <AdminEventDetailView data={res.data} />;
  }
  if (id.startsWith("tr-")) {
    const rawId = id.slice(3);
    if (!UUID.test(rawId)) notFound();
    const res = await getTournamentForAdmin({ tournamentId: rawId });
    if (!res.ok) notFound();
    return <AdminTournamentDetailView data={res.data} />;
  }
  notFound();
}
