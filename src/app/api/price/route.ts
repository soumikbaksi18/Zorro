import { getSpot } from "@/lib/prices";

export async function GET() {
  try {
    return Response.json(await getSpot());
  } catch {
    return Response.json({ error: "Price unavailable" }, { status: 503 });
  }
}
