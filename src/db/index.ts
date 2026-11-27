// Database connection. Server-side only.
// Local: a SQLite file (default ~/.zorro/zorro.db, see url.ts).
// Deployed: any libsql URL (e.g. a Turso database) plus DATABASE_AUTH_TOKEN.

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { DATABASE_URL } from "./url";

const url = DATABASE_URL;

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
