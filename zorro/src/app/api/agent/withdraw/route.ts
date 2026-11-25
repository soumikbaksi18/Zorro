import { AgentError } from "@/lib/agent-service";
import { jsonRoute, readJson } from "@/lib/route";
import { requestOrigin, requireUser } from "@/lib/session";
import { WithdrawInputSchema, withdrawFunds } from "@/lib/wallet-service";

/** Preview (dry: true) or send a withdrawal to the user's own signed address. */
export async function POST(request: Request) {
  return jsonRoute(async () => {
    const user = await requireUser();
    await requestOrigin();
    const parsed = WithdrawInputSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new AgentError(parsed.error.issues[0]?.message ?? "Check the amount");
    return withdrawFunds(user, parsed.data);
  });
}
