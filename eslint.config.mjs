import { existsSync, readdirSync } from "node:fs";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Skip any top-level folder that is its own git repository (other projects checked out here).
const nestedRepos = readdirSync(".", { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "node_modules" && existsSync(`${d.name}/.git`))
  .map((d) => `${d.name}/**`);

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-stale/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ...nestedRepos,
  ]),
]);

export default eslintConfig;
