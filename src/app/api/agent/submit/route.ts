import { z } from "zod";
import { AgentError, submitAgentCreate, waitForAgent } from "@/lib/agent-service";
import { jsonRoute, readJson } from "@/lib/route";
import { requestOrigin, requireUser } from "@/lib/session";

const Body = z.object({
  correlationId: z.string().startsWith("intent_").max(200),
  /** The passkey assertion (AuthenticationResponseJSON). Omit to only check progress. */
  credential: z.record(z.string(), z.unknown()).optional(),
});

/** Step 2: send the passkey signature to NEAR Intents and wait for the wallet. */
export async function POST(request: Request) {
  return jsonRoute(async () => {
    const user = await requireUser();
    await requestOrigin(); // same-site requests only
    const parsed = Body.safeParse(await readJson(request));
    if (!parsed.success) throw new AgentError("Invalid request");
    const { correlationId, credential } = parsed.data;
    return credential ? submitAgentCreate(user, correlationId, credential) : waitForAgent(user, correlationId);
  });
}
