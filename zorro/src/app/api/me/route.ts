import { connection } from "next/server";
import { refreshAgent } from "@/lib/agent-service";
import { jsonRoute } from "@/lib/route";
import { getCurrentUser } from "@/lib/session";

/** Who is signed in, and their bot wallet (if any). Never returns keys or tokens. */
export async function GET() {
  await connection();
  return jsonRoute(async () => {
    const user = await getCurrentUser();
    if (!user) return { user: null, agent: null };
    return {
      user: { id: user.id, origin: user.origin, createdAt: user.createdAt.toISOString() },
      agent: await refreshAgent(user),
    };
  });
}
