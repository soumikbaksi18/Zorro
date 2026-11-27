import { AgentError } from "@/lib/agent-service";
import { jsonRoute, readJson } from "@/lib/route";
import { requestOrigin, requireUser } from "@/lib/session";
import { DepositInputSchema, createDeposit } from "@/lib/wallet-service";

/** A one-time address that adds funds to the wallet. Never spends anything. */
export async function POST(request: Request) {
  return jsonRoute(async () => {
    const user = await requireUser();
    await requestOrigin();
    const parsed = DepositInputSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new AgentError("Choose a coin");
    return createDeposit(user, parsed.data.coinKey);
  });
}
