import { z } from "zod";
import { AiError } from "@/lib/ai";
import { AgentError } from "@/lib/agent-service";
import { askAssistant, checkAssistantRateLimit } from "@/lib/assistant";
import { SarvamError } from "@/lib/sarvam";
import { jsonRoute, readJson } from "@/lib/route";
import { requestOrigin, requireUser } from "@/lib/session";

const Body = z.object({
  text: z.string().max(1000),
  language: z.string().max(12).nullish(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(20).default([]),
});

/** Ask Zorro: answer + actions (charts, drafts, screens). Moves no money. */
export async function POST(request: Request) {
  return jsonRoute(async () => {
    const user = await requireUser();
    await requestOrigin();
    const parsed = Body.safeParse(await readJson(request));
    if (!parsed.success) throw new AgentError("Keep it under 1,000 characters.");
    try {
      checkAssistantRateLimit(user.id);
      return await askAssistant(user, { text: parsed.data.text, history: parsed.data.history, language: parsed.data.language ?? null });
    } catch (e) {
      if (e instanceof AiError) {
        throw new AgentError(e.message.startsWith("Refusing") ? "Please don't share addresses or keys here. Use payee names instead." : e.message, 422);
      }
      if (e instanceof SarvamError) throw new AgentError(e.message, e.status);
      throw e;
    }
  });
}
