import { z } from "zod";
import { AgentError } from "@/lib/agent-service";
import { prepareApproval, submitApproval } from "@/lib/payees";
import { jsonRoute, readJson } from "@/lib/route";
import { requestOrigin, requireUser } from "@/lib/session";

const Body = z.union([
  z.object({ step: z.literal("prepare") }),
  z.object({
    step: z.literal("submit"),
    correlationId: z.string().startsWith("intent_").max(200),
    credential: z.record(z.string(), z.unknown()).optional(),
  }),
]);

/** Approve every waiting payee with one passkey signature (a policy_update). */
export async function POST(request: Request) {
  return jsonRoute(async () => {
    const user = await requireUser();
    const { origin } = await requestOrigin();
    const parsed = Body.safeParse(await readJson(request));
    if (!parsed.success) throw new AgentError("Invalid request");
    if (parsed.data.step === "prepare") return prepareApproval(user, origin);
    return submitApproval(user, parsed.data.correlationId, parsed.data.credential);
  });
}
