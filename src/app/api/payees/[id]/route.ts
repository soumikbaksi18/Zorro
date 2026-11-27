import { removePayee } from "@/lib/payees";
import { jsonRoute } from "@/lib/route";
import { requestOrigin, requireUser } from "@/lib/session";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/payees/[id]">) {
  return jsonRoute(async () => {
    const user = await requireUser();
    await requestOrigin();
    await removePayee(user, (await ctx.params).id);
    return { ok: true };
  });
}
