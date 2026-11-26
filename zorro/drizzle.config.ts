import { defineConfig } from "drizzle-kit";
import { DATABASE_URL } from "./src/db/url";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "turso", // libsql: works for local SQLite files and hosted Turso
  dbCredentials: {
    url: DATABASE_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
});
