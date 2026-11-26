import type { NextRequest } from "next/server";
import { getHistory, type HistoryRange } from "@/lib/prices";

const RANGES: HistoryRange[] = ["1d", "7d", "30d", "90d"];

export async function GET(request: NextRequest) {
  const param = request.nextUrl.searchParams.get("range") ?? "1d";
  if (!RANGES.includes(param as HistoryRange)) {
    return Response.json({ error: "range must be 1d, 7d, 30d or 90d" }, { status: 400 });
  }
  try {
    return Response.json(await getHistory(param as HistoryRange));
  } catch {
    return Response.json({ error: "History unavailable" }, { status: 503 });
  }
}
