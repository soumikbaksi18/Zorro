// The payment worker's tick (used by scripts/worker.ts). Server-side only.
// Every tick: heartbeat → run due Autopays → move each wallet's payments forward one step.
// Every 4th tick: check payment links and deposit addresses.

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { processPayments } from "./payments";
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

export async function runTick(log: (msg: string) => void = () => {}): Promise<TickSummary> {
  const value = { at: new Date().toISOString() };
  await db
    .insert(schema.appState)
    .values({ key: HEARTBEAT_KEY, value })
    .onConflictDoUpdate({ target: schema.appState.key, set: { value, updatedAt: new Date() } });

  const autopays = await runDueSchedules(log);
  const steps = await processPayments(log);
  let paidLinks = 0;
  let deposits = 0;
  if (tickCount++ % 4 === 0) {
    paidLinks = await refreshPendingRequests().catch(() => 0);
    deposits = await followDeposits().catch(() => 0);
  }
  return { autopays, steps, paidLinks, deposits };
}
