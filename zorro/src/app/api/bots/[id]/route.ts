import { AgentError } from "@/lib/agent-service";
import { BotActionSchema, getBot, updateBot } from "@/lib/bots/service";
import { jsonRoute, readJson } from "@/lib/route";
import { requestOrigin, requireUser } from "@/lib/session";

export async function GET(_request: Request, ctx: RouteContext<"/api/bots/[id]">) {
  return jsonRoute(async () => getBot(await requireUser(), (await ctx.params).id));
}

/** { action: "pause" | "resume" | "stop" } */
export async function POST(request: Request, ctx: RouteContext<"/api/bots/[id]">) {
  return jsonRoute(async () => {
    const user = await requireUser();
    await requestOrigin();
    const parsed = BotActionSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new AgentError("Unknown action");
    return updateBot(user, (await ctx.params).id, parsed.data.action);
  });
}
