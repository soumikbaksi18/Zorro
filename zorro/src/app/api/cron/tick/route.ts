import { connection } from "next/server";
import { cronRun } from "@/lib/worker";

// Vercel Cron calls this (see vercel.json): due Autopays, payment links, deposits, then it keeps
// advancing payments until they finish or the time budget runs out. Also safe to call from an
// external scheduler with the same secret (e.g. every 5 minutes for faster Autopay).
export const maxDuration = 300;

export async function GET(request: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const lines: string[] = [];
  const summary = await cronRun(maxDuration * 1000, (msg) => lines.push(msg));
  return Response.json({ ok: true, ...summary, log: lines.slice(-50) }, { headers: { "cache-control": "no-store" } });
}
