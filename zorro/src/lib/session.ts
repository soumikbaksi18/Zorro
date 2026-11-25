// Sessions and request origin. Server-side only.
// Zorro has no passwords or emails: a passkey signs you in, and a session cookie
// keeps you signed in. The cookie holds a random token; the database stores only its hash.

import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { db, schema } from "@/db";
import { sha256Hex } from "./crypto";

const SESSION_COOKIE = "zorro_session";
const SESSION_DAYS = 30;

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/**
 * The origin and relying-party ID for passkeys, taken from the browser's Origin header
 * and checked against the Host the request arrived on (no cross-site requests).
 */
export async function requestOrigin(): Promise<{ origin: string; rpId: string; secure: boolean }> {
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!origin || !host) throw new AuthError("Missing origin");
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new AuthError("Bad origin");
  }
  if (url.host !== host) throw new AuthError("Cross-site request refused", 403);
  const secure = url.protocol === "https:";
  if (!secure && url.hostname !== "localhost") {
    throw new AuthError("Passkeys need a secure connection. Open Zorro over HTTPS (or on localhost).");
  }
  return { origin: url.origin, rpId: url.hostname, secure };
}

export async function createSession(userId: string, secure: boolean): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(schema.sessions).values({ tokenHash: sha256Hex(token), userId, expiresAt });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export type CurrentUser = typeof schema.users.$inferSelect;

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(and(eq(schema.sessions.tokenHash, sha256Hex(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  return row?.user ?? null;
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Sign in with your passkey first", 401);
  return user;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha256Hex(token)));
  jar.delete(SESSION_COOKIE);
}
