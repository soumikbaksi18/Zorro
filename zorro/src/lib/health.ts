// Checks every external dependency Zorro needs. Server-side only.
// Returns only yes/no and short reasons, never keys, IDs or balances.

import { count } from "drizzle-orm";
import { db, schema } from "@/db";
import { network, whoami } from "./agent-api";
import { aiConfigured, aiPing } from "./ai";
import { workerHeartbeat } from "./bots/runner";
import { encryptionConfigured } from "./crypto";
import { getTokens } from "./oneclick";

export type Check = { ok: boolean; detail: string };
export type HealthReport = {
  ok: boolean;
  checkedAt: string;
  checks: {
    database: Check;
    encryption: Check;
    swaps: Check & { keyConfigured: boolean };
    agentApi: Check & { keyValid: boolean; ownerTypes: string[] };
    ai: Check & { configured: boolean };
    worker: Check;
  };
};

async function guard<T>(fn: () => Promise<T>, ms = 15_000): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), ms)),
  ]);
}

const reason = (e: unknown) => (e instanceof Error ? e.message : "unknown error").slice(0, 140);

// The AI check costs a (tiny) request, so reuse the result for 5 minutes.
let aiCache: { at: number; check: Check } | null = null;
const AI_CACHE_MS = 5 * 60_000;

export async function runHealthChecks(): Promise<HealthReport> {
  const [database, swaps, agentApi, ai] = await Promise.all([
    guard(async (): Promise<Check> => {
      const [row] = await db.select({ n: count() }).from(schema.users);
      return { ok: true, detail: `Connected (${row.n} user${row.n === 1 ? "" : "s"})` };
    }).catch((e): Check => ({ ok: false, detail: `Not ready: ${reason(e)}. Run npm run db:migrate.` })),

    guard(async () => {
      const list = await getTokens();
      const hasZec = list.some((t) => t.assetId === "nep141:zec.omft.near");
      return { ok: hasZec, detail: hasZec ? "NEAR Intents 1Click reachable, ZEC listed" : "ZEC missing from token list" };
    }).catch((e): Check => ({ ok: false, detail: reason(e) })),

    guard(async () => {
      const [net, me] = await Promise.all([network(), whoami().then(() => true).catch(() => false)]);
      const operational = net.status.overall === "operational";
      return {
        ok: operational && me,
        keyValid: me,
        ownerTypes: net.supported_owner_types,
        detail: !me ? "API key missing or rejected" : operational ? `Operational (${net.network})` : `Status: ${net.status.overall}`,
      };
    }).catch((e) => ({ ok: false, keyValid: false, ownerTypes: [] as string[], detail: reason(e) })),

    (async () => {
      if (!aiConfigured()) return { ok: false, configured: false, detail: "No AI key configured" };
      if (aiCache && Date.now() - aiCache.at < AI_CACHE_MS) return { ...aiCache.check, configured: true };
      const check: Check = await guard(() => aiPing(), 30_000)
        .then((): Check => ({ ok: true, detail: "Responding" }))
        .catch((e): Check => ({ ok: false, detail: reason(e) }));
      aiCache = { at: Date.now(), check };
      return { ...check, configured: true };
    })(),
  ]);

  const beat = await workerHeartbeat().catch(() => null);
  const ageSec = beat ? Math.round((Date.now() - new Date(beat).getTime()) / 1000) : null;
  const worker: Check =
    ageSec !== null && ageSec < 90
      ? { ok: true, detail: `Running (last tick ${ageSec}s ago)` }
      : { ok: false, detail: ageSec === null ? "Not running. Start it with npm run worker" : `Stopped ${ageSec}s ago. Start it with npm run worker` };

  const encryption: Check = encryptionConfigured()
    ? { ok: true, detail: "Key loaded" }
    : { ok: false, detail: "ZORRO_ENCRYPTION_KEY missing or invalid" };

  const checks = {
    database,
    encryption,
    swaps: { ...swaps, keyConfigured: Boolean(process.env.ONECLICK_API_KEY) },
    agentApi,
    ai,
    worker,
  };
  return { ok: Object.values(checks).every((c) => c.ok), checkedAt: new Date().toISOString(), checks };
}
