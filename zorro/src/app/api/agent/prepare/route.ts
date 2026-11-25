import { AgentError, PolicyInputSchema, prepareAgentCreate } from "@/lib/agent-service";
import { jsonRoute, readJson } from "@/lib/route";
import { requestOrigin, requireUser } from "@/lib/session";

/** Step 1: build the policy and the agent_create intent for the user's passkey to sign. */
export async function POST(request: Request) {
  return jsonRoute(async () => {
    const user = await requireUser();
    const { origin } = await requestOrigin();
    const parsed = PolicyInputSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new AgentError(parsed.error.issues[0]?.message ?? "Check your limits");
    return prepareAgentCreate(user, origin, parsed.data);
  });
}
