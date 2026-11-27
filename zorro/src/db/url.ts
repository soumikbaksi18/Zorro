// Where the database lives. Shared by the app, the payment worker and drizzle-kit.
//
// The local default is OUTSIDE the project on purpose: the worker writes the database
// every tick, and a file inside the project makes the Next.js dev server rebuild and reload
// every open page each time it changes.

import { homedir } from "node:os";
import { join } from "node:path";

// On Vercel there is no persistent disk: a hosted database (Turso) is required.
if (process.env.VERCEL && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. On Vercel, use a Turso database (libsql://…) and DATABASE_AUTH_TOKEN. See README → Deploy.");
}

export const DATABASE_URL = process.env.DATABASE_URL ?? `file:${join(homedir(), ".zorro", "zorro.db")}`;
