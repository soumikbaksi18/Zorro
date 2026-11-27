// Moving payments forward. Server-side only.
//
// Locally, scripts/worker.ts runs runTick() every 5 s. On Vercel (no always-on process) the
// same work happens on demand: nudgeUser() when someone opens the app or a receipt, and the
// daily cron job (/api/cron/tick) for Autopay. Payment leases make all of these safe together.

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { activeAgentFor } from "./agent-service";
import { advanceWallet, hasActivePayments, processPayments } from "./payments";
import { refreshPendingRequests } from "./requests";
import { runDueSchedules } from "./schedules";
import { followDeposits } from "./wallet-service";

const HEARTBEAT_KEY = "worker_heartbeat";
let tickCount = 0;

export async function workerHeartbeat(): Promise<string | null> {
  const [row] = await db.select().from(schema.appState).where(eq(schema.appState.key, HEARTBEAT_KEY)).limit(1);
  return (row?.value as { at?: string } | undefined)?.at ?? null;
}

export type TickSummary = { autopays: number; steps: number; paidLinks: number; deposits: number };

export async function runTick(log: (msg: string) => void = () => {}, opts: { everything?: boolean } = {}): Promise<TickSummary> {
  const value = { at: new Date().toISOString() };
  await db
    .insert(schema.appState)
    .values({ key: HEARTBEAT_KEY, value })
    .onConflictDoUpdate({ target: schema.appState.key, set: { value, updatedAt: new Date() } });

  const autopays = await runDueSchedules(log);
  const steps = await processPayments(log);
  let paidLinks = 0;
  let deposits = 0;
  if (opts.everything || tickCount++ % 4 === 0) {
    paidLinks = await refreshPendingRequests().catch(() => 0);
    deposits = await followDeposits().catch(() => 0);
  }
  return { autopays, steps, paidLinks, deposits };
}

/** Keep one user's money moving when they open the app (serverless: no always-on worker). */
export async function nudgeUser(userId: string): Promise<void> {
  const agent = await activeAgentFor(userId);
  if (!agent || agent.status !== "ACTIVE") return;
  await Promise.allSettled([advanceWallet(agent.id), refreshPendingRequests(userId), followDeposits(agent.id)]);
}

/**
 * Cron: run due Autopays, check links and deposits, then keep advancing payments until they
 * finish or the time budget runs out (conversions settle in seconds, payouts in a minute or two).
 */
export async function cronRun(budgetMs: number, log: (msg: string) => void = () => {}): Promise<TickSummary & { rounds: number }> {
  const started = Date.now();
  const first = await runTick(log, { everything: true });
  let rounds = 1;
  while (Date.now() - started < budgetMs - 8_000 && (await hasActivePayments())) {
    await new Promise((r) => setTimeout(r, 5_000));
    first.steps += await processPayments(log);
    rounds++;
  }
  return { ...first, rounds };
}
