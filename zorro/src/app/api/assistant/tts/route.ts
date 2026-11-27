import { z } from "zod";
import { checkAssistantRateLimit } from "@/lib/assistant";
import { SarvamError, speak } from "@/lib/sarvam";
import { requestOrigin, requireUser, AuthError } from "@/lib/session";

const Body = z.object({ text: z.string().min(1).max(4000), language: z.string().max(12).nullish() });

/** Text → spoken MP3 (Bulbul), in the reply's language. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requestOrigin();
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Nothing to say" }, { status: 400 });
    checkAssistantRateLimit(`${user.id}:tts`, 40);
    const audio = await speak(parsed.data.text, parsed.data.language ?? "en-IN");
    return new Response(new Uint8Array(audio), { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof AuthError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof SarvamError) return Response.json({ error: e.message }, { status: e.status });
    const message = e instanceof Error && e.message.startsWith("You've asked") ? e.message : "Voice is unavailable right now.";
    return Response.json({ error: message }, { status: 502 });
  }
}
