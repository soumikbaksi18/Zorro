import { checkGrant } from "@/lib/agent-service";
import { jsonRoute } from "@/lib/route";
import { requestOrigin, requireUser } from "@/lib/session";

/** Prove Zorro's bot permission works (a dry-run quote; never moves money). */
export async function POST() {
  return jsonRoute(async () => {
    const user = await requireUser();
    await requestOrigin();
    return checkGrant(user);
  });
}
