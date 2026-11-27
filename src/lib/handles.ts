// Zorro @handles: how users find each other for instant private transfers. Server-side only.

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { AgentError } from "./agent-service";
import type { CurrentUser } from "./session";

const RESERVED = new Set(["zorro", "admin", "support", "help", "zcash", "near", "pay", "team", "official"]);

export const HandleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((h) => h.replace(/^@/, ""))
  .pipe(z.string().regex(/^[a-z0-9_]{3,20}$/, "Use 3–20 letters, numbers or _"));

export async function setHandle(user: CurrentUser, raw: string): Promise<string> {
  const parsed = HandleSchema.safeParse(raw);
  if (!parsed.success) throw new AgentError(parsed.error.issues[0]?.message ?? "Invalid handle");
  const handle = parsed.data;
  if (RESERVED.has(handle)) throw new AgentError("That handle is reserved.");
  const [taken] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.handle, handle)).limit(1);
  if (taken && taken.id !== user.id) throw new AgentError("That handle is taken.", 409);
  await db.update(schema.users).set({ handle }).where(eq(schema.users.id, user.id));
  return handle;
}

/** A Zorro user's NEAR Intents account, found by @handle (only if their wallet is active). */
export async function lookupHandle(raw: string): Promise<{ userId: string; handle: string; nearAccountId: string } | null> {
  const parsed = HandleSchema.safeParse(raw);
  if (!parsed.success) return null;
  const [row] = await db
    .select({ userId: schema.users.id, handle: schema.users.handle, nearAccountId: schema.agents.nearAccountId })
    .from(schema.users)
    .innerJoin(schema.agents, eq(schema.agents.userId, schema.users.id))
    .where(and(eq(schema.users.handle, parsed.data), inArray(schema.agents.status, ["ACTIVE"])))
    .limit(1);
  if (!row?.handle || !row.nearAccountId) return null;
  return { userId: row.userId, handle: row.handle, nearAccountId: row.nearAccountId };
}
