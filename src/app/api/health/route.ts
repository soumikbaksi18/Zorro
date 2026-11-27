import { connection } from "next/server";
import { runHealthChecks } from "@/lib/health";

export async function GET() {
  await connection(); // always check live, never prerender
  const report = await runHealthChecks();
  return Response.json(report, { status: report.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
