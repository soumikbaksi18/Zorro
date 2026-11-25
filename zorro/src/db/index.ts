// Database connection. Server-side only.
// Local: a SQLite file (DATABASE_URL=file:./data/zorro.db, the default).
// Deployed: any libsql URL (e.g. a Turso database) plus DATABASE_AUTH_TOKEN.

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "file:./data/zorro.db";

function makeClient(): Client {
  if (url.startsWith("file:")) {
    mkdirSync(dirname(url.slice("file:".length)), { recursive: true });
  }
  return createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
}

// Reuse one connection across dev hot reloads.
const globalForDb = globalThis as unknown as { zorroDbClient?: Client };
export const dbClient = globalForDb.zorroDbClient ?? makeClient();
if (process.env.NODE_ENV !== "production") globalForDb.zorroDbClient = dbClient;

export const db = drizzle(dbClient, { schema });
export { schema };
