import { z } from "zod";
import { AgentError } from "@/lib/agent-service";
import { backtest } from "@/lib/bots/backtest";
import { BotConfigSchema } from "@/lib/bots/config";
import { getHistory } from "@/lib/prices";
import { jsonRoute, readJson } from "@/lib/route";

const Body = z.object({ config: BotConfigSchema, range: z.enum(["7d", "30d", "90d"]) });

/** Replay real ZEC price history through a bot's strategy. Public price data only; moves nothing. */
export async function POST(request: Request) {
  return jsonRoute(async () => {
    const parsed = Body.safeParse(await readJson(request));
    if (!parsed.success) throw new AgentError(parsed.error.issues[0]?.message ?? "Check the bot settings");
    const points = await getHistory(parsed.data.range).catch(() => {
      throw new AgentError("Price history is unavailable right now. Try again in a minute.", 503);
    });
    try {
      return { range: parsed.data.range, points, result: backtest(parsed.data.config, points) };
    } catch (e) {
      throw new AgentError(e instanceof Error ? e.message : "Backtest failed");
    }
  });
}
