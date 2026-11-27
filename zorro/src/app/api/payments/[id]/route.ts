import { connection } from "next/server";
import { getPayment } from "@/lib/payments";
import { jsonRoute } from "@/lib/route";
import { requireUser } from "@/lib/session";

export async function GET(_request: Request, ctx: RouteContext<"/api/payments/[id]">) {
  await connection();
  return jsonRoute(async () => getPayment(await requireUser(), (await ctx.params).id));
}
