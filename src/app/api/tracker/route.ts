import { after, connection } from "next/server";
import { getPolicy } from "@/lib/agent-api";
import { activeAgentFor } from "@/lib/agent-service";
import { listPayments, monthSummary } from "@/lib/payments";
import { getRates } from "@/lib/rates";
import { jsonRoute } from "@/lib/route";
import { requireUser } from "@/lib/session";
import { nudgeUser } from "@/lib/worker";

/** The Tracker: this month's totals, today's limit and the full ledger. */
export async function GET() {
  await connection();
  return jsonRoute(async () => {
    const user = await requireUser();
    after(() => nudgeUser(user.id).catch(() => {}));
    const agent = await activeAgentFor(user.id);
    const [summary, payments, policy, rates] = await Promise.all([
      monthSummary(user),
      listPayments(user, { limit: 200 }),
      agent ? getPolicy(agent.id).catch(() => null) : null,
      getRates().catch(() => null),
    ]);
    const daily = policy?.usage?.budget.daily;
    return {
      summary,
      payments,
      usdInr: rates?.usdInr ?? null,
      today: daily ? { limitUsd: daily.limit_usd, spentUsd: daily.spent_usd, resetsAt: daily.resets_at } : null,
    };
  });
}
