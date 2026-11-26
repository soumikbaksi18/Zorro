import { z } from "zod";
import { AiError, aiConfigured } from "@/lib/ai";
import { AgentError } from "@/lib/agent-service";
import { checkAiRateLimit, explainBacktest } from "@/lib/ai-strategy";
import { BotConfigSchema } from "@/lib/bots/config";
import { jsonRoute, readJson } from "@/lib/route";
import { requestOrigin, requireUser } from "@/lib/session";

const Body = z.object({
  config: BotConfigSchema,
  result: z.object({
    summary: z.string().max(1200),
    stats: z.array(z.object({ label: z.string().max(60), value: z.string().max(80) })).max(8),
    startValueUsd: z.number(),
    endValueUsd: z.number(),
    holdValueUsd: z.number(),
    feesUsd: z.number(),
  }),
});

/** A plain-English explanation of a backtest result. */
export async function POST(request: Request) {
  return jsonRoute(async () => {
    const user = await requireUser();
    await requestOrigin();
    if (!aiConfigured()) throw new AgentError("The AI assistant isn't set up on this server.", 503);
    const parsed = Body.safeParse(await readJson(request));
    if (!parsed.success) throw new AgentError("Invalid backtest");
    try {
      checkAiRateLimit(user.id);
      return { explanation: await explainBacktest(parsed.data.config, parsed.data.result) };
    } catch (e) {
      if (e instanceof AiError) throw new AgentError(e.message, 422);
      throw e;
    }
  });
}
