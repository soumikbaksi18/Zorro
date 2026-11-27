import { connection } from "next/server";
import { AgentError } from "@/lib/agent-service";
import { cancelRequest, publicRequest } from "@/lib/requests";
import { jsonRoute } from "@/lib/route";
import { requestOrigin, requireUser } from "@/lib/session";

const validId = (id: string) => /^[a-z0-9]{6,20}$/.test(id);

/** Public: what the payer sees (amount, note, @handle). */
export async function GET(_request: Request, ctx: RouteContext<"/api/requests/[id]">) {
  await connection();
  return jsonRoute(async () => {
    const { id } = await ctx.params;
    if (!validId(id)) throw new AgentError("This payment link doesn't exist.", 404);
    return publicRequest(id);
  });
}

/** Owner: cancel the link. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/requests/[id]">) {
  return jsonRoute(async () => {
    const user = await requireUser();
    await requestOrigin();
    await cancelRequest(user, (await ctx.params).id);
    return { ok: true };
  });
}
