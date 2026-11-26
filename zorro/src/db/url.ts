// Where the database lives. Shared by the app, the bot worker and drizzle-kit.
//
// The local default is OUTSIDE the project on purpose: the bot worker writes the database
// every tick, and a file inside the project makes the Next.js dev server rebuild and reload
// every open page each time it changes.

import { homedir } from "node:os";
import { join } from "node:path";

export const DATABASE_URL = process.env.DATABASE_URL ?? `file:${join(homedir(), ".zorro", "zorro.db")}`;
