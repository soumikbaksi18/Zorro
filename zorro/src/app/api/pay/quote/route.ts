import { AgentError } from "@/lib/agent-service";
import { PayInputSchema, quotePayment } from "@/lib/payments";
import { jsonRoute, readJson } from "@/lib/route";
import { requestOrigin, requireUser } from "@/lib/session";

/** What a payment will cost in ZEC, with fees and any problem. Moves nothing. */
export async function POST(request: Request) {
  return jsonRoute(async () => {
    const user = await requireUser();
    await requestOrigin();
    const parsed = PayInputSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new AgentError(parsed.error.issues[0]?.message ?? "Check the payment");
    const quote: Partial<Awaited<ReturnType<typeof quotePayment>>> = await quotePayment(user, parsed.data);
    delete quote.plan; // internal routing details stay on the server
    return quote;
  });
}
