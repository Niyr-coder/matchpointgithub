import { getHelpHomeData } from "@/server/actions/help";
import { AyudaGuiasScreenView } from "./AyudaGuiasScreenView";

export async function AyudaGuiasScreen() {
  const data = await getHelpHomeData();
  return <AyudaGuiasScreenView data={data} />;
}
