import { AgentError } from "@/lib/agent-service";
import { checkAssistantRateLimit } from "@/lib/assistant";
import { SarvamError, transcribe } from "@/lib/sarvam";
import { jsonRoute } from "@/lib/route";
import { requestOrigin, requireUser } from "@/lib/session";

const MAX_BYTES = 5 * 1024 * 1024; // ~ a few minutes of compressed speech

/** Voice → text (any of 22 Indian languages or English, auto-detected). */
export async function POST(request: Request) {
  return jsonRoute(async () => {
    const user = await requireUser();
    await requestOrigin();
    const form = await request.formData().catch(() => null);
    const audio = form?.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) throw new AgentError("No recording received.");
    if (audio.size > MAX_BYTES) throw new AgentError("That recording is too long. Keep it under a minute.");
    try {
      checkAssistantRateLimit(`${user.id}:stt`, 40);
      const name = audio.type.includes("mp4") ? "voice.m4a" : audio.type.includes("ogg") ? "voice.ogg" : "voice.webm";
      const { transcript, languageCode } = await transcribe(audio, name);
      return { transcript, language: languageCode };
    } catch (e) {
      if (e instanceof SarvamError) throw new AgentError(e.message, e.status);
      throw e;
    }
  });
}
