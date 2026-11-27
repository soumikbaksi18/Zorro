import { connection, type NextRequest } from "next/server";
import { AgentError } from "@/lib/agent-service";
import { CHART_ASSETS, CHART_RANGES, getAssetChart, type ChartAsset, type ChartRange } from "@/lib/history";
import { jsonRoute } from "@/lib/route";
import { requireUser } from "@/lib/session";

/** Price history for the assistant's charts. */
export async function GET(request: NextRequest) {
  await connection();
  return jsonRoute(async () => {
    await requireUser();
    const asset = request.nextUrl.searchParams.get("asset") ?? "ZEC";
    const range = request.nextUrl.searchParams.get("range") ?? "7d";
    if (!(CHART_ASSETS as readonly string[]).includes(asset) || !(CHART_RANGES as readonly string[]).includes(range)) throw new AgentError("Unknown chart");
    try {
      return await getAssetChart(asset as ChartAsset, range as ChartRange);
    } catch {
      throw new AgentError("Price history is unavailable right now.", 503);
    }
  });
}
