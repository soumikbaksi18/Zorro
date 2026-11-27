// Apply database migrations: `npm run db:migrate`
// Migrations are generated from src/db/schema.ts with `npm run db:generate`.

import { migrate } from "drizzle-orm/libsql/migrator";
import { db, dbClient } from "../src/db";

async function main() {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Database is up to date.");
  dbClient.close();
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
