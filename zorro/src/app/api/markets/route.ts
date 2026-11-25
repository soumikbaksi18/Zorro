import { getMarkets } from "@/lib/markets";

export async function GET() {
  try {
    return Response.json(await getMarkets());
  } catch {
    return Response.json({ error: "Markets unavailable" }, { status: 503 });
  }
}
