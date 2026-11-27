import { connection } from "next/server";
import { NewsError, checkNewsRateLimit, getLatestNews, getMoreNews } from "@/lib/news";

/** Zcash news. `?page=<token>` loads older stories. Public data; the API key stays on the server. */
export async function GET(request: Request) {
  await connection();
  const page = new URL(request.url).searchParams.get("page");
  try {
    if (page) {
      if (!/^[A-Za-z0-9_-]{1,200}$/.test(page)) return Response.json({ error: "Invalid page" }, { status: 400 });
      checkNewsRateLimit();
      return Response.json(await getMoreNews(page));
    }
    return Response.json(await getLatestNews());
  } catch (e) {
    if (e instanceof NewsError) return Response.json({ error: e.message }, { status: e.status });
    console.error("news failed", e instanceof Error ? e.message : e);
    return Response.json({ error: "News is unavailable right now." }, { status: 502 });
  }
}
