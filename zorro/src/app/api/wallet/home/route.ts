import { connection } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { listPayments } from "@/lib/payments";
import { jsonRoute } from "@/lib/route";
import { requireUser } from "@/lib/session";
import { balancesFor } from "@/lib/wallet-service";

/** Everything the Home screen needs in one call. */
export async function GET() {
  await connection();
  return jsonRoute(async () => {
    const user = await requireUser();
    const [balances, recent, pending] = await Promise.all([
      balancesFor(user),
      listPayments(user, { limit: 6 }),
      db
        .select({ id: schema.payees.id })
        .from(schema.payees)
        .where(and(eq(schema.payees.userId, user.id), inArray(schema.payees.status, ["pending", "approving"]))),
    ]);
    return { balances, recent, pendingPayees: pending.length, handle: user.handle };
  });
}
