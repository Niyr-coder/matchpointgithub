import { listMyGiveaways } from "@/server/actions/giveaways";
import { MyGiveawaysViewClient } from "@/components/dashboard/giveaways/MyGiveawaysViewClient";

export async function MyGiveawaysScreen() {
  const res = await listMyGiveaways({});
  const rows = res.ok ? res.data : [];
  return <MyGiveawaysViewClient rows={rows} />;
}
