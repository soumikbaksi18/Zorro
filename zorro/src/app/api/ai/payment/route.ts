import { z } from "zod";
import { AiError, aiConfigured } from "@/lib/ai";
import { AgentError } from "@/lib/agent-service";
import { checkAiRateLimit, draftFromText } from "@/lib/ai-payments";
import { jsonRoute, readJson } from "@/lib/route";
import { requestOrigin, requireUser } from "@/lib/session";

const Body = z.object({ text: z.string().max(400) });

/** Plain English → a drafted payment or Autopay for the user to review. Moves nothing. */
export async function POST(request: Request) {
  return jsonRoute(async () => {
    const user = await requireUser();
    await requestOrigin();
    if (!aiConfigured()) throw new AgentError("The assistant isn't set up on this server.", 503);
    const parsed = Body.safeParse(await readJson(request));
    if (!parsed.success) throw new AgentError("Keep it under 400 characters.");
    try {
      checkAiRateLimit(user.id);
      return await draftFromText(user, parsed.data.text);
    } catch (e) {
      if (e instanceof AiError) throw new AgentError(e.message.startsWith("Refusing") ? "Please don't include addresses or keys. Use payee names instead." : e.message, 422);
      throw e;
    }
  });
}
