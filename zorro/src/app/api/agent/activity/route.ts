import { connection } from "next/server";
import { jsonRoute } from "@/lib/route";
import { requireUser } from "@/lib/session";
import { activityFor } from "@/lib/wallet-service";

export async function GET() {
  await connection();
  return jsonRoute(async () => activityFor(await requireUser()));
}
