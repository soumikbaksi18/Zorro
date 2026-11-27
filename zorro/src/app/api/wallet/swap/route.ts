import { after } from "next/server";
import { AgentError } from "@/lib/agent-service";
import { ConvertInputSchema, advanceWallet, createConvert } from "@/lib/payments";
import { jsonRoute, readJson } from "@/lib/route";
import { requestOrigin, requireUser } from "@/lib/session";

/** Queue a swap inside the wallet. The worker runs it; the receipt shows progress. */
export async function POST(request: Request) {
  return jsonRoute(async () => {
    const user = await requireUser();
    await requestOrigin();
    const parsed = ConvertInputSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new AgentError(parsed.error.issues[0]?.message ?? "Check the swap");
    const { id, agentId } = await createConvert(user, parsed.data);
    after(() => advanceWallet(agentId).catch(() => false));
    return { id };
  });
}
