import { connection } from "next/server";
import { AiError, aiConfigured } from "@/lib/ai";
import { NewsError, getLatestNews } from "@/lib/news";
import { getNewsBrief, headlinesFor } from "@/lib/news-brief";

/** AI summary of the latest Zcash headlines. Uses only the server's own cached headlines. */
export async function GET() {
  await connection();
  try {
    if (!aiConfigured()) return Response.json({ error: "The AI summary isn't set up on this server." }, { status: 503 });
    const { articles } = await getLatestNews();
    if (articles.length < 2) return Response.json({ error: "Not enough recent news to summarise yet." }, { status: 404 });
    return Response.json(await getNewsBrief(headlinesFor(articles)));
  } catch (e) {
    if (e instanceof NewsError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof AiError) return Response.json({ error: "The AI summary is unavailable right now." }, { status: 502 });
    console.error("news brief failed", e instanceof Error ? e.message : e);
    return Response.json({ error: "The AI summary is unavailable right now." }, { status: 502 });
  }
}
