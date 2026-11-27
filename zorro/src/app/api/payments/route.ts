import { after, connection, type NextRequest } from "next/server";
import { AgentError } from "@/lib/agent-service";
import { PayInputSchema, advanceWallet, createPayment, listPayments } from "@/lib/payments";
import { jsonRoute, readJson } from "@/lib/route";
import { requestOrigin, requireUser } from "@/lib/session";

export async function GET(request: NextRequest) {
  await connection();
  return jsonRoute(async () => {
    const limit = Math.min(200, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 100) || 100));
    return listPayments(await requireUser(), { limit });
  });
}

/** Queue a payment. The worker runs it (convert, then send) within the wallet rules. */
export async function POST(request: Request) {
  return jsonRoute(async () => {
    const user = await requireUser();
    await requestOrigin();
    const parsed = PayInputSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new AgentError(parsed.error.issues[0]?.message ?? "Check the payment");
    const { id, agentId } = await createPayment(user, parsed.data);
    after(() => advanceWallet(agentId).catch(() => false)); // start right away (no always-on worker on Vercel)
    return { id };
  });
}
