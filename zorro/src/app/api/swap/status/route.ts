import type { NextRequest } from "next/server";
import { OneClickError } from "@/lib/oneclick";
import { swapStatus } from "@/lib/swap";

export async function GET(request: NextRequest) {
  const depositAddress = request.nextUrl.searchParams.get("depositAddress")?.trim();
  if (!depositAddress || depositAddress.length > 128) {
    return Response.json({ error: "depositAddress is required" }, { status: 400 });
  }
  try {
    return Response.json(await swapStatus(depositAddress));
  } catch (e) {
    if (e instanceof OneClickError && e.status === 404) {
      return Response.json({ error: "Swap not found" }, { status: 404 });
    }
    return Response.json({ error: "Status unavailable" }, { status: 503 });
  }
}
