import { connection } from "next/server";
import { getPayment } from "@/lib/payments";
import { jsonRoute } from "@/lib/route";
import { requireUser } from "@/lib/session";

export async function GET(_request: Request, ctx: RouteContext<"/api/payments/[id]">) {
  await connection();
  // Reading a receipt also moves its payment forward a step.
  return jsonRoute(async () => getPayment(await requireUser(), (await ctx.params).id, { advance: true }));
}
