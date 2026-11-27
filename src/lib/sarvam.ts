// Sarvam AI: speech-to-text, text-to-speech and chat for the voice assistant. Server-side only.
// Docs: https://docs.sarvam.ai/api-reference (auth header: api-subscription-key).

import { z } from "zod";

const BASE_URL = process.env.SARVAM_BASE_URL ?? "https://api.sarvam.ai";
const CHAT_MODEL = process.env.SARVAM_CHAT_MODEL ?? "sarvam-105b";
const TTS_SPEAKER = process.env.SARVAM_TTS_SPEAKER ?? "priya";

export class SarvamError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

export const sarvamConfigured = () => Boolean(process.env.SARVAM_API_KEY);

function key(): string {
  const k = process.env.SARVAM_API_KEY;
  if (!k) throw new SarvamError("Voice isn't set up on this server yet.", 503);
  return k;
}

async function fail(res: Response, what: string): Promise<never> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;
  const code = body?.error?.code ?? "";
  if (res.status === 401 || res.status === 403 || /api_key|authentication/.test(code)) throw new SarvamError("The voice service key was rejected.", 503);
  if (res.status === 429 || /rate_limit|quota/.test(code)) throw new SarvamError("The voice service is busy. Try again in a moment.", 429);
  throw new SarvamError(`${what} failed${body?.error?.message ? `: ${body.error.message}` : ` (${res.status})`}`, 502);
}

// ---------- Speech to text (Saaras) ----------

/** Words Zorro users say that a general model might mishear. */
const KEYTERMS = ["Zorro", "Zcash", "ZEC", "NEAR Intents", "USDC", "USDT", "Solana", "Autopay", "Zashi"];

export async function transcribe(audio: Blob, filename: string): Promise<{ transcript: string; languageCode: string | null }> {
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", "saaras:v4");
  form.append("mode", "transcribe");
  form.append("language_code", "unknown"); // auto-detect: English and 22 Indian languages
  form.append("keyterms", JSON.stringify(KEYTERMS));
  const res = await fetch(`${BASE_URL}/speech-to-text`, {
    method: "POST",
    headers: { "api-subscription-key": key() },
    body: form,
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) await fail(res, "Speech recognition");
  const data = z.object({ transcript: z.string(), language_code: z.string().nullish() }).parse(await res.json());
  return { transcript: data.transcript.trim(), languageCode: data.language_code ?? null };
}

// ---------- Text to speech (Bulbul) ----------

/** Languages Bulbul can speak; anything else is read in Indian English. */
export const TTS_LANGUAGES = ["bn-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN", "ml-IN", "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN"] as const;
export const ttsLanguage = (code: string | null | undefined) => (TTS_LANGUAGES as readonly string[]).includes(code ?? "") ? (code as string) : "en-IN";

/** Strip markdown and symbols that read badly aloud, and keep it short enough to listen to. */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_#>`~|]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
}

export async function speak(text: string, languageCode: string): Promise<Buffer> {
  const res = await fetch(`${BASE_URL}/text-to-speech`, {
    method: "POST",
    headers: { "api-subscription-key": key(), "content-type": "application/json" },
    body: JSON.stringify({
      text: speakable(text),
      language_code: ttsLanguage(languageCode),
      model: "bulbul:v3",
      speaker: TTS_SPEAKER,
      pace: 1.05,
      output_audio_codec: "mp3",
      speech_sample_rate: 24000,
      enable_preprocessing: true, // reads numbers and English words naturally
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) await fail(res, "Speech synthesis");
  const data = z.object({ audios: z.array(z.string()).min(1) }).parse(await res.json());
  return Buffer.from(data.audios.join(""), "base64");
}

// ---------- Chat (Sarvam-105B) ----------

const ChatResponse = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullish() }).loose() })).min(1),
});

export async function chat(messages: { role: "system" | "user" | "assistant"; content: string }[], opts: { json?: boolean; maxTokens?: number } = {}): Promise<string> {
  const body: Record<string, unknown> = {
    model: CHAT_MODEL,
    messages,
    temperature: 0.3,
    max_tokens: opts.maxTokens ?? 1500,
    reasoning_effort: "low", // answers in a voice chat should come back fast
  };
  if (opts.json) body.response_format = { type: "json_object" };
  const res = await fetch(`${BASE_URL}/v2/chat/completions`, {
    method: "POST",
    headers: { "api-subscription-key": key(), "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) await fail(res, "Chat");
  const data = ChatResponse.parse(await res.json());
  const content = data.choices[0].message.content ?? "";
  if (!content.trim()) throw new SarvamError("The assistant returned an empty answer.");
  return content;
}
