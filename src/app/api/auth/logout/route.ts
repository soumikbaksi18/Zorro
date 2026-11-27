import { jsonRoute } from "@/lib/route";
import { destroySession } from "@/lib/session";

export async function POST() {
  return jsonRoute(async () => {
    await destroySession();
    return { ok: true };
  });
}
