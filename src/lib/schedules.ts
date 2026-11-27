// Autopay: payments that repeat weekly or monthly. Server-side only.
// Runs happen at 9:00 in India (IST, UTC+5:30, no daylight saving). The worker creates a
// normal payment for each run, so it goes through the same quote, limits and safety checks.

import { randomUUID } from "node:crypto";
import { and, eq, lte } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { AgentError, activeAgentFor } from "./agent-service";
import { coin } from "./coins";
import { createPayment, recordFailedPayment } from "./payments";
import { payeeFor } from "./payees";
import { getRates, priceOf, toUsd } from "./rates";
import type { CurrentUser } from "./session";

const IST_MS = 330 * 60_000;
const RUN_HOUR_IST = 9;

/** The next run strictly after `after`: weekday 0-6 (Sun-Sat) or day of month 1-28, at 9:00 IST. */
export function nextRunAfter(frequency: "weekly" | "monthly", day: number, after: Date): Date {
  const local = new Date(after.getTime() + IST_MS);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  const at = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm, dd, RUN_HOUR_IST, 0) - IST_MS);
  if (frequency === "weekly") {
    for (let i = 0; i <= 7; i++) {
      const candidate = at(y, m, d + i);
      if (new Date(candidate.getTime() + IST_MS).getUTCDay() === day && candidate > after) return candidate;
    }
  } else {
    for (let i = 0; i <= 2; i++) {
      const candidate = at(y, m + i, day);
      if (candidate > after) return candidate;
    }
  }
  throw new Error("Couldn't compute the next run");
}

export const ScheduleInputSchema = z
  .object({
    payeeId: z.string().min(1),
    amount: z.string().trim().regex(/^\d+(\.\d+)?$/, "Enter an amount"),
    currency: z.enum(["COIN", "USD"]),
    frequency: z.enum(["weekly", "monthly"]),
    day: z.number().int(),
    note: z.string().trim().max(120).optional(),
  })
  .refine((s) => (s.frequency === "weekly" ? s.day >= 0 && s.day <= 6 : s.day >= 1 && s.day <= 28), {
    message: "Pick a weekday, or a date from 1 to 28",
    path: ["day"],
  })
  .refine((s) => Number(s.amount) > 0, { message: "Enter an amount above zero", path: ["amount"] });

export type ScheduleView = {
  id: string;
  payee: { id: string; name: string; coinKey: string; kind: string };
  amount: string;
  currency: "COIN" | "USD" | "INR";
  frequency: "weekly" | "monthly";
  day: number;
  note: string | null;
  status: "active" | "paused";
  nextRunAt: string;
  lastRunAt: string | null;
  estimate: { zec: number; usd: number } | null;
};

export async function listSchedules(user: CurrentUser): Promise<ScheduleView[]> {
  const rows = await db
    .select({ s: schema.schedules, p: schema.payees })
    .from(schema.schedules)
    .innerJoin(schema.payees, eq(schema.payees.id, schema.schedules.payeeId))
    .where(eq(schema.schedules.userId, user.id))
    .orderBy(schema.schedules.nextRunAt);
  const rates = await getRates().catch(() => null);
  return rows.map(({ s, p }) => {
    let estimate: ScheduleView["estimate"] = null;
    if (rates) {
      try {
        const usd = toUsd(rates, Number(s.amount), s.currency, coin(s.coinKey));
        estimate = { usd, zec: (usd / rates.zecUsd) * 1.02 };
      } catch {}
    }
    return {
      id: s.id,
      payee: { id: p.id, name: p.name, coinKey: p.coinKey, kind: p.kind },
      amount: s.amount,
      currency: s.currency,
      frequency: s.frequency,
      day: s.day,
      note: s.note,
      status: s.status,
      nextRunAt: s.nextRunAt.toISOString(),
      lastRunAt: s.lastRunAt?.toISOString() ?? null,
      estimate,
    };
  });
}

export async function createSchedule(user: CurrentUser, input: z.infer<typeof ScheduleInputSchema>): Promise<{ id: string; nextRunAt: string }> {
  const agent = await activeAgentFor(user.id);
  if (!agent || agent.status !== "ACTIVE") throw new AgentError("Create your Zorro wallet first.", 409);
  const payee = await payeeFor(user, input.payeeId);
  if (payee.status !== "approved") throw new AgentError("Approve this payee with Face ID first.", 409);
  const count = (await db.select({ id: schema.schedules.id }).from(schema.schedules).where(eq(schema.schedules.userId, user.id))).length;
  if (count >= 20) throw new AgentError("You can have up to 20 Autopays.", 409);
  if (input.currency === "COIN") {
    const rates = await getRates().catch(() => null);
    if (rates) priceOf(rates, coin(payee.coinKey)); // fails early if the coin has no price
  }
  const id = randomUUID();
  const nextRunAt = nextRunAfter(input.frequency, input.day, new Date());
  await db.insert(schema.schedules).values({
    id,
    userId: user.id,
    payeeId: payee.id,
    coinKey: payee.coinKey,
    amount: input.amount,
    currency: input.currency,
    frequency: input.frequency,
    day: input.day,
    note: input.note || null,
    status: "active",
    nextRunAt,
  });
  return { id, nextRunAt: nextRunAt.toISOString() };
}

export const ScheduleActionSchema = z.object({ action: z.enum(["pause", "resume", "delete", "run_now"]) });

export async function updateSchedule(user: CurrentUser, id: string, action: z.infer<typeof ScheduleActionSchema>["action"]) {
  const [s] = await db.select().from(schema.schedules).where(and(eq(schema.schedules.id, id), eq(schema.schedules.userId, user.id))).limit(1);
  if (!s) throw new AgentError("Autopay not found.", 404);
  if (action === "delete") {
    await db.delete(schema.schedules).where(eq(schema.schedules.id, id));
  } else if (action === "pause") {
    await db.update(schema.schedules).set({ status: "paused" }).where(eq(schema.schedules.id, id));
  } else if (action === "resume") {
    await db.update(schema.schedules).set({ status: "active", nextRunAt: nextRunAfter(s.frequency, s.day, new Date()) }).where(eq(schema.schedules.id, id));
  } else {
    // "Pay now": run this one immediately; the regular schedule continues afterwards.
    const { id: paymentId } = await createPayment(user, { payeeId: s.payeeId, amount: s.amount, currency: s.currency, fundWith: "zec", note: s.note ?? undefined }, { scheduleId: s.id });
    await db.update(schema.schedules).set({ lastRunAt: new Date() }).where(eq(schema.schedules.id, id));
    return { paymentId };
  }
  return {};
}

/** Worker: turn every due Autopay into a payment, then move it to its next date. */
export async function runDueSchedules(log: (msg: string) => void = () => {}, now = new Date()): Promise<number> {
  const due = await db
    .select()
    .from(schema.schedules)
    .where(and(eq(schema.schedules.status, "active"), lte(schema.schedules.nextRunAt, now)));
  let n = 0;
  for (const s of due) {
    // Claim this run first (only if nobody else moved it), so a run can never happen twice.
    const next = nextRunAfter(s.frequency, s.day, now);
    const claimed = await db
      .update(schema.schedules)
      .set({ nextRunAt: next, lastRunAt: now })
      .where(and(eq(schema.schedules.id, s.id), eq(schema.schedules.nextRunAt, s.nextRunAt)))
      .returning({ id: schema.schedules.id });
    if (!claimed.length) continue;

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, s.userId)).limit(1);
    const [payee] = await db.select().from(schema.payees).where(eq(schema.payees.id, s.payeeId)).limit(1);
    if (!user || !payee) continue;
    try {
      const { quote } = await createPayment(user, { payeeId: s.payeeId, amount: s.amount, currency: s.currency, fundWith: "zec", note: s.note ?? undefined }, { scheduleId: s.id });
      log(`autopay: queued ${quote.amount} ${coin(quote.coinKey).symbol} to ${payee.name}`);
      n++;
    } catch (e) {
      const agent = await activeAgentFor(user.id);
      const error = e instanceof Error ? e.message : "Autopay couldn't run";
      if (agent) await recordFailedPayment(user, agent.id, { payee, amount: s.amount, scheduleId: s.id, error: `Autopay skipped: ${error}` });
      log(`autopay to ${payee.name} skipped: ${error}`);
    }
  }
  return n;
}
