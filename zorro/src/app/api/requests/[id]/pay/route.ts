import { AgentError } from "@/lib/agent-service";
import { PayRequestSchema, startRequestPayment } from "@/lib/requests";
import { jsonRoute, readJson } from "@/lib/route";

// Public, so rate-limit per link: each new deposit address counts against the wallet's daily quota.
const recent = new Map<string, number[]>();

/** Public: the payer picks a coin and gets a one-time address (converted to ZEC on arrival). */
export async function POST(request: Request, ctx: RouteContext<"/api/requests/[id]/pay">) {
  return jsonRoute(async () => {
    const { id } = await ctx.params;
    if (!/^[a-z0-9]{6,20}$/.test(id)) throw new AgentError("This payment link doesn't exist.", 404);
    const now = Date.now();
    const hits = (recent.get(id) ?? []).filter((t) => now - t < 3_600_000);
    if (hits.length >= 8) throw new AgentError("Too many attempts on this link. Try again later.", 429);
    recent.set(id, [...hits, now]);
    const parsed = PayRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new AgentError("Choose a coin");
    return startRequestPayment(id, parsed.data.coinKey);
  });
}
