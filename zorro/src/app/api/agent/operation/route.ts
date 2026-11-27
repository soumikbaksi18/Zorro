import { connection, type NextRequest } from "next/server";
import { AgentError } from "@/lib/agent-service";
import { jsonRoute } from "@/lib/route";
import { requireUser } from "@/lib/session";
import { depositStatus } from "@/lib/wallet-service";

/** Live status of one of this user's deposits. */
export async function GET(request: NextRequest) {
  await connection(); // always per request, never prerendered
  return jsonRoute(async () => {
    const user = await requireUser();
    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!/^op_[\w-]{1,120}$/.test(id)) throw new AgentError("Invalid id");
    return depositStatus(user, id);
  });
}
