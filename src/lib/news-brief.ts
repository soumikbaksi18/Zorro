// "Zcash today in 30 seconds": an AI summary of the latest headlines.
// Only public headlines go to the AI service. Cached per set of headlines.

import { z } from "zod";
import { aiJson } from "./ai";
import { cached, type NewsArticle } from "./news";

const BriefSchema = z.object({
  summary: z.string().min(10).max(500),
  mood: z.enum(["positive", "mixed", "negative"]),
  points: z.array(z.string().max(200)).min(1).max(4),
});

export type NewsBrief = z.infer<typeof BriefSchema> & { basedOn: number };

export function headlinesFor(articles: NewsArticle[]): string[] {
  return articles.slice(0, 15).map((a) => `${a.title} (${a.source.name}, ${a.publishedAt.slice(0, 10)})`);
}

export function getNewsBrief(headlines: string[]): Promise<NewsBrief> {
  return cached(`brief:${headlines.join("|")}`, 30 * 60_000, () => summarise(headlines));
}

async function summarise(headlines: string[]): Promise<NewsBrief> {
  const { data } = await aiJson({
    system:
      'You summarise Zcash (ZEC) news for everyday users of a ZEC wallet app. Use ONLY the headlines given; never invent events, numbers or quotes. ' +
      'Write "summary" as 2 short plain-English sentences on what is happening with Zcash. "points" are 3 short bullet points on the main stories. ' +
      '"mood" is the overall tone of the headlines (positive, mixed or negative). Never give trading advice or price predictions. ' +
      'Reply as JSON: {"summary":"...","mood":"positive|mixed|negative","points":["...","...","..."]}',
    user: headlines.map((h, i) => `${i + 1}. ${h}`).join("\n"),
    schema: BriefSchema,
    maxTokens: 400,
    temperature: 0.2,
  });
  return { ...data, basedOn: headlines.length };
}
