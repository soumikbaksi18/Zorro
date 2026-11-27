import { AgentError } from "@/lib/agent-service";
import { ConvertInputSchema, quoteConvert } from "@/lib/payments";
import { jsonRoute, readJson } from "@/lib/route";
import { requestOrigin, requireUser } from "@/lib/session";

/** Quote a swap inside the wallet (e.g. ZEC → USDC). Moves nothing. */
export async function POST(request: Request) {
  return jsonRoute(async () => {
    const user = await requireUser();
    await requestOrigin();
    const parsed = ConvertInputSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new AgentError(parsed.error.issues[0]?.message ?? "Check the swap");
    const quote: Partial<Awaited<ReturnType<typeof quoteConvert>>> = await quoteConvert(user, parsed.data);
    delete quote.plan; // internal routing details stay on the server
    return quote;
  });
}
