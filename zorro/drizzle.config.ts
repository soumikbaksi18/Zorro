import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "turso", // libsql: works for local SQLite files and hosted Turso
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./data/zorro.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
});
