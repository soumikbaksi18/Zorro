import { SwapError, SwapInputSchema, quoteSwap } from "@/lib/swap";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = SwapInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  try {
    return Response.json(await quoteSwap(parsed.data));
  } catch (e) {
    if (e instanceof SwapError) return Response.json({ error: e.message }, { status: 422 });
    console.error("swap quote failed", e);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
