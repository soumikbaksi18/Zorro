// AI client (OpenAI-compatible chat completions API). Server-side only.
// The UI calls this "AI-powered" and does not name the provider.
//
// Rules (see PLAN.md §4):
// - The AI never trades. It only returns JSON that we validate with a zod schema.
// - Never send addresses, balances, keys or tokens. aiJson() refuses input that looks like one.

import { z } from "zod";

const BASE_URL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

export class AiError extends Error {}

export function aiConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

// Things that must never leave the server in an AI prompt.
const SENSITIVE_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "Zcash address", re: /\b(u1[02-9ac-hj-np-z]{60,}|zs1[02-9ac-hj-np-z]{60,}|t[13][1-9A-HJ-NP-Za-km-z]{33})\b/ },
  { label: "EVM address or key", re: /\b0x[0-9a-fA-F]{40,}\b/ },
  { label: "grant or session token", re: /\bng[ts]_[A-Za-z0-9_-]{10,}/ },
  { label: "Solana address", re: /\b[1-9A-HJ-NP-Za-km-z]{43,44}\b/ },
  { label: "API key", re: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/ },
];

/** Throws if the text contains something that looks like an address, key or token. */
export function assertNoSensitiveData(text: string): void {
  for (const { label, re } of SENSITIVE_PATTERNS) {
    if (re.test(text)) throw new AiError(`Refusing to send a ${label} to the AI service`);
  }
}

const CompletionSchema = z.object({
  model: z.string(),
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).partial().optional(),
});

/**
 * Ask the model for JSON and validate it. Invalid output is rejected, never guessed at.
 */
export async function aiJson<T>(opts: {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ data: T; model: string }> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new AiError("AI is not configured");
  assertNoSensitiveData(opts.user);

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: `${opts.system}\n\nRespond with a single JSON object and nothing else.` },
        { role: "user", content: opts.user },
      ],
      response_format: { type: "json_object" },
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 800,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new AiError(res.status === 401 ? "AI key was rejected" : `AI service error (${res.status})`);
  }

  const completion = CompletionSchema.parse(await res.json());
  const content = completion.choices[0].message.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AiError("AI returned something that isn't JSON");
  }
  const result = opts.schema.safeParse(parsed);
  if (!result.success) throw new AiError(`AI output failed validation: ${result.error.issues[0]?.message}`);
  return { data: result.data, model: completion.model };
}

/** Cheap connectivity check used by /api/health. */
export async function aiPing(): Promise<{ model: string }> {
  const { model } = await aiJson({
    system: "You are a health check.",
    user: 'Reply with {"ok": true}.',
    schema: z.object({ ok: z.literal(true) }),
    maxTokens: 20,
    temperature: 0,
  });
  return { model };
}
