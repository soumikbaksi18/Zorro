import { z } from "zod";
import { AiError, aiConfigured } from "@/lib/ai";
import { AgentError } from "@/lib/agent-service";
import { checkAiRateLimit, strategyFromText } from "@/lib/ai-strategy";
import { getSpot } from "@/lib/prices";
import { jsonRoute, readJson } from "@/lib/route";
import { requestOrigin, requireUser } from "@/lib/session";

const Body = z.object({ text: z.string().max(600) });

/** Plain English → a validated (paper) bot config. Only the typed text and today's price go to the AI. */
export async function POST(request: Request) {
  return jsonRoute(async () => {
    const user = await requireUser();
    await requestOrigin();
    if (!aiConfigured()) throw new AgentError("The AI assistant isn't set up on this server.", 503);
    const parsed = Body.safeParse(await readJson(request));
    if (!parsed.success) throw new AgentError("Describe your strategy in under 600 characters.");
    try {
      checkAiRateLimit(user.id);
      const spot = await getSpot();
      return await strategyFromText(parsed.data.text, spot.zecUsd);
    } catch (e) {
      if (e instanceof AiError) throw new AgentError(e.message, 422);
      throw e;
    }
  });
}
