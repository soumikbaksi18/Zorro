import { z } from "zod";
import { AgentError } from "@/lib/agent-service";
import { jsonRoute, readJson } from "@/lib/route";
import { requestOrigin, requireUser } from "@/lib/session";
import { AssetKeySchema, createDeposit } from "@/lib/wallet-service";

const Body = z.object({ asset: AssetKeySchema });

/** A one-time address that credits the bot wallet. Never spends anything. */
export async function POST(request: Request) {
  return jsonRoute(async () => {
    const user = await requireUser();
    await requestOrigin();
    const parsed = Body.safeParse(await readJson(request));
    if (!parsed.success) throw new AgentError("Choose ZEC or USDC");
    return createDeposit(user, parsed.data.asset);
  });
}
