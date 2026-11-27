import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// A throwaway database built from every migration, like a fresh Turso database on first deploy.
const dir = mkdtempSync(join(tmpdir(), "zorro-lease-"));
process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;

const { db, dbClient, schema } = await import("@/db");
const { migrate } = await import("drizzle-orm/libsql/migrator");
const { claimPayment, releasePayment } = await import("./payments");

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(schema.users).values({
    id: "u1",
    passkeyCredentialId: "cred",
    passkeyPublicKey: "pk",
    passkeyPublicKeyCose: "cose",
    rpId: "localhost",
    origin: "http://localhost:3000",
  });
  await db.insert(schema.payments).values({
    id: "p1",
    userId: "u1",
    agentId: "a1",
    direction: "out",
    kind: "pay",
    counterparty: "Riya",
    coinKey: "usdc-base",
    amount: "5",
    fundCoinKey: "zec",
    status: "queued",
  });
});

afterAll(() => {
  dbClient.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("payment lease (no step ever runs twice at once)", () => {
  it("builds every migration on an empty database", async () => {
    const tables = await dbClient.execute("select name from sqlite_master where type='table'");
    const names = tables.rows.map((r) => r.name);
    for (const t of ["users", "payees", "payments", "schedules", "payment_requests", "operations"]) expect(names).toContain(t);
  });

  it("lets exactly one of several simultaneous claims win", async () => {
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => claimPayment("p1")));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("can be claimed again after release", async () => {
    await releasePayment("p1");
    expect(await claimPayment("p1")).toBe(true);
    expect(await claimPayment("p1")).toBe(false);
  });

  it("can be taken over once a lease expires (e.g. a crashed request)", async () => {
    const later = new Date(Date.now() + 5 * 60_000);
    expect(await claimPayment("p1", later)).toBe(true);
  });
});
