import { connection } from "next/server";
import { AgentError } from "@/lib/agent-service";
import { RequestInputSchema, createRequest, listRequests } from "@/lib/requests";
import { jsonRoute, readJson } from "@/lib/route";
import { requestOrigin, requireUser } from "@/lib/session";

export async function GET() {
  await connection();
  return jsonRoute(async () => listRequests(await requireUser()));
}

/** Create a payment link (get paid in any coin, arrives as ZEC). */
export async function POST(request: Request) {
  return jsonRoute(async () => {
    const user = await requireUser();
    await requestOrigin();
    const parsed = RequestInputSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new AgentError(parsed.error.issues[0]?.message ?? "Check the request");
    return createRequest(user, parsed.data);
  });
}
