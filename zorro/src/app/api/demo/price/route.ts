import { connection } from "next/server";
import { z } from "zod";
import { AgentError } from "@/lib/agent-service";
import { getDemoPrice, setDemoPrice } from "@/lib/bots/runner";
import { jsonRoute, readJson } from "@/lib/route";
import { requestOrigin, requireUser } from "@/lib/session";

// Demo mode feeds a chosen ZEC price to the bot worker so a stop-loss can be shown firing live.
// Off unless ZORRO_DEMO_MODE=1. It affects every bot on this server: never enable it in production.
const enabled = () => process.env.ZORRO_DEMO_MODE === "1";
const Body = z.object({ priceUsd: z.number().positive().max(100_000).nullable() });

export async function GET() {
  await connection();
  return jsonRoute(async () => ({ enabled: enabled(), price: enabled() ? await getDemoPrice() : null }));
}

export async function POST(request: Request) {
  return jsonRoute(async () => {
    if (!enabled()) throw new AgentError("Demo mode is off", 404);
    await requireUser();
    await requestOrigin();
    const parsed = Body.safeParse(await readJson(request));
    if (!parsed.success) throw new AgentError("Enter a price");
    await setDemoPrice(parsed.data.priceUsd);
    return { enabled: true, price: await getDemoPrice() };
  });
}
