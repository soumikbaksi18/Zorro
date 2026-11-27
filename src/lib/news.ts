// Zcash-only news. Server-side only: the API key never reaches the browser.
// Works with a NewsAPI.org key (32 characters) or a NewsData.io key ("pub_…"); the key's format picks the service.
// Free plans have small daily limits, so results are cached for 30 minutes.

import { z } from "zod";

export class NewsError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

// Any of these names works in .env.local.
const apiKey = () =>
  (process.env.NEWS_API_KEY || process.env.NEWSAPI_KEY || process.env.NEWSDATA_API_KEY || process.env.NEWS_DATA_API_KEY)?.trim() || null;
export const newsConfigured = () => Boolean(apiKey());
type Provider = "newsapi" | "newsdata";
const providerFor = (key: string): Provider => (key.startsWith("pub_") ? "newsdata" : "newsapi");

export type NewsTopic = "markets" | "tech" | "ecosystem" | "general";

export type NewsArticle = {
  id: string;
  title: string;
  link: string;
  description: string | null;
  imageUrl: string | null;
  source: { name: string; icon: string | null };
  publishedAt: string; // ISO, UTC
  keywords: string[];
  topic: NewsTopic;
};

export type NewsPage = { articles: NewsArticle[]; nextPage: string | null; fetchedAt: string };

/** One article in a common shape (NewsData's field names); fields vary by plan, so all optional. */
const ArticleSchema = z.object({
  article_id: z.string().optional(),
  title: z.string().nullish(),
  link: z.string().nullish(),
  description: z.string().nullish(),
  image_url: z.string().nullish(),
  source_id: z.string().nullish(),
  source_name: z.string().nullish(),
  source_icon: z.string().nullish(),
  pubDate: z.string().nullish(),
  keywords: z.array(z.string()).nullish(),
  coin: z.array(z.string()).nullish(),
  duplicate: z.boolean().nullish(),
});
type RawArticle = z.infer<typeof ArticleSchema>;
type RawPage = { articles: RawArticle[]; nextPage: string | null };

const limitError = () => new NewsError("The news service's daily limit is used up. Try again later.", 429);
const keyError = () => new NewsError("The news API key was rejected.", 503);

// ---------- NewsAPI.org ----------

const NEWSAPI_PAGE_SIZE = 25;
const NEWSAPI_MAX_RESULTS = 100; // Developer plan cap

const NewsApiResponse = z.union([
  z.object({ status: z.literal("ok"), totalResults: z.number().optional(), articles: z.array(z.unknown()) }),
  z.object({ status: z.literal("error"), code: z.string().optional(), message: z.string().optional() }),
]);
const NewsApiArticle = z.object({
  source: z.object({ id: z.string().nullish(), name: z.string().nullish() }).nullish(),
  title: z.string().nullish(),
  description: z.string().nullish(),
  url: z.string().nullish(),
  urlToImage: z.string().nullish(),
  publishedAt: z.string().nullish(),
});

async function newsApi(key: string, page: number): Promise<RawPage> {
  const params = new URLSearchParams({
    q: 'zcash OR "ZEC" OR zashi',
    searchIn: "title,description",
    language: "en",
    sortBy: "publishedAt",
    pageSize: String(NEWSAPI_PAGE_SIZE),
    page: String(page),
  });
  const res = await fetch(`https://newsapi.org/v2/everything?${params}`, {
    headers: { accept: "application/json", "x-api-key": key, "user-agent": "Zorro/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  const body = NewsApiResponse.safeParse(await res.json().catch(() => null));
  if (!body.success) throw new NewsError(`News service error (${res.status})`);
  if (body.data.status === "error") {
    const code = body.data.code ?? "";
    if (code === "rateLimited") throw limitError();
    if (code === "maximumResultsReached") return { articles: [], nextPage: null };
    if (/^apiKey/.test(code)) throw keyError();
    throw new NewsError(body.data.message ?? "News service error");
  }
  const articles = body.data.articles.flatMap((raw) => {
    const a = NewsApiArticle.safeParse(raw);
    if (!a.success || !a.data.title || a.data.title === "[Removed]") return [];
    return [
      {
        title: a.data.title,
        link: a.data.url,
        description: a.data.description,
        image_url: a.data.urlToImage,
        source_name: a.data.source?.name,
        pubDate: a.data.publishedAt,
      } satisfies RawArticle,
    ];
  });
  const total = Math.min(body.data.totalResults ?? 0, NEWSAPI_MAX_RESULTS);
  return { articles, nextPage: page * NEWSAPI_PAGE_SIZE < total ? String(page + 1) : null };
}

// ---------- NewsData.io ----------

const NewsDataResponse = z.union([
  z.object({ status: z.literal("success"), results: z.array(z.unknown()), nextPage: z.string().nullish() }),
  z.object({ status: z.literal("error"), results: z.object({ message: z.string().optional(), code: z.string().optional() }) }),
]);

async function newsData(key: string, endpoint: "latest" | "crypto", params: Record<string, string>): Promise<RawPage> {
  const url = `https://newsdata.io/api/1/${endpoint}?${new URLSearchParams({ apikey: key, ...params })}`;
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  const body = NewsDataResponse.safeParse(await res.json().catch(() => null));
  if (!body.success) throw new NewsError(`News service error (${res.status})`);
  if (body.data.status === "error") {
    const code = body.data.results.code ?? "";
    if (/limit/i.test(code)) throw limitError();
    if (/unauthori|apikey/i.test(code)) throw keyError();
    throw new NewsError(body.data.results.message ?? "News service error");
  }
  const articles = body.data.results.flatMap((raw) => {
    const a = ArticleSchema.safeParse(raw);
    return a.success ? [a.data] : [];
  });
  return { articles, nextPage: body.data.nextPage ?? null };
}

/** First page when `page` is null. NewsData's first page also merges its ZEC crypto feed. */
async function fetchRaw(page: string | null): Promise<RawPage> {
  const key = apiKey();
  if (!key) throw new NewsError("News isn't set up on this server yet.", 503);
  if (providerFor(key) === "newsapi") return newsApi(key, page ? Number(page) : 1);

  const query = { q: "zcash OR ZEC", language: "en" };
  if (page) return newsData(key, "latest", { ...query, page });
  const [general, crypto] = await Promise.allSettled([newsData(key, "latest", query), newsData(key, "crypto", { coin: "zec", language: "en" })]);
  if (general.status === "rejected" && crypto.status === "rejected") throw general.reason;
  return {
    articles: [...(general.status === "fulfilled" ? general.value.articles : []), ...(crypto.status === "fulfilled" ? crypto.value.articles : [])],
    nextPage: general.status === "fulfilled" ? general.value.nextPage : null,
  };
}

// ---------- Cleaning ----------

const ZEC_UPPER = /\bZEC\b/; // "zec" in lowercase is too often part of other words/names

function isAboutZcash(a: RawArticle): boolean {
  if (a.coin?.some((c) => c.toLowerCase() === "zec")) return true;
  const text = `${a.title ?? ""} ${a.description ?? ""} ${(a.keywords ?? []).join(" ")}`;
  return /zcash|zashi|zodl|electric coin co/i.test(text) || ZEC_UPPER.test(text);
}

const stripHtml = (s: string) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

function safeUrl(u: string | null | undefined, httpsOnly = false): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    if (url.protocol === "https:" || (!httpsOnly && url.protocol === "http:")) return url.toString();
  } catch {}
  return null;
}

// Checked in this order: the specific topics first, Markets (the most common words) last.
const TOPICS: { topic: NewsTopic; re: RegExp }[] = [
  { topic: "tech", re: /privacy|private|shield|zero-knowledge|\bzk|halo ?2|orchard|sapling|network upgrade|\bnu ?\d|halving|zebra|zcashd|crosslink|proof-of-stake|protocol|developer|quantum|encryption|\bmin(e|ed|er|ers|ing)\b|hashrate/i },
  { topic: "ecosystem", re: /foundation|grant|\becc\b|electric coin|\bzf\b|partnership|integrat|launch|adopt|community|bounty|hackathon|wallet|zashi|zodl|near intents|treasury|regulat|delist|\bsec\b|government|supply on/i },
  { topic: "markets", re: /price|rally|surge|soar|jump|plunge|drop|fall|crash|gain|trad(e|ing|er)|market|bull|bear|\betfs?\b|whale|liquidat|short|\blong\b|%|\$\d|all-time high|\bath\b|breakout|support|resistance|futures|listing|nasdaq/i },
];

function topicOf(title: string, description: string | null): NewsTopic {
  const text = `${title} ${description ?? ""}`;
  // The headline decides first; the description only breaks ties.
  for (const { topic, re } of TOPICS) if (re.test(title)) return topic;
  for (const { topic, re } of TOPICS) if (re.test(text)) return topic;
  return "general";
}

function parseDate(pubDate: string | null | undefined): string | null {
  if (!pubDate) return null;
  // NewsData sends "2026-11-26 09:30:00" in UTC.
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(pubDate) ? pubDate : `${pubDate.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Package indexes and code hosts show up in keyword search but aren't news.
const NOT_NEWS = /(^|\.)(pypi\.org|github\.com|npmjs\.com|crates\.io|rubygems\.org)$/i;
const isNewsLink = (link: string) => !NOT_NEWS.test(new URL(link).hostname);

function clean(raw: RawArticle[]): NewsArticle[] {
  const seen = new Set<string>();
  const out: NewsArticle[] = [];
  for (const a of raw) {
    if (a.duplicate || !isAboutZcash(a)) continue;
    const title = stripHtml(a.title ?? "");
    const link = safeUrl(a.link);
    const publishedAt = parseDate(a.pubDate);
    if (!title || !link || !publishedAt || !isNewsLink(link)) continue;
    const dedupeKey = title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 80);
    if (seen.has(link) || seen.has(dedupeKey)) continue;
    seen.add(link);
    seen.add(dedupeKey);
    const description = a.description ? stripHtml(a.description).slice(0, 600) || null : null;
    out.push({
      id: a.article_id ?? link,
      title,
      link,
      description: description && description !== title ? description : null,
      imageUrl: safeUrl(a.image_url, true),
      source: { name: stripHtml(a.source_name ?? a.source_id ?? "News"), icon: safeUrl(a.source_icon, true) },
      publishedAt,
      keywords: (a.keywords ?? []).slice(0, 6),
      topic: topicOf(title, description),
    });
  }
  return out.sort((x, y) => y.publishedAt.localeCompare(x.publishedAt));
}

// ---------- Public API ----------

// Small in-memory cache. Unlike "use cache", it keeps error types intact and never caches a failure.
const memo = new Map<string, { until: number; value: Promise<unknown> }>();
export function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && hit.until > Date.now()) return hit.value as Promise<T>;
  const value = fn();
  memo.set(key, { until: Date.now() + ttlMs, value });
  value.catch(() => memo.delete(key));
  if (memo.size > 200) memo.delete(memo.keys().next().value as string);
  return value;
}

/** Newest stories. Cached 30 minutes. */
export function getLatestNews(): Promise<NewsPage> {
  return cached("latest", 30 * 60_000, () => fetchClean(null));
}

/** Older stories (one request per page). Cached per page token. */
export function getMoreNews(page: string): Promise<NewsPage> {
  return cached(`page:${page}`, 60 * 60_000, () => fetchClean(page));
}

async function fetchClean(page: string | null): Promise<NewsPage> {
  const { articles, nextPage } = await fetchRaw(page);
  return { articles: clean(articles), nextPage, fetchedAt: new Date().toISOString() };
}

// Uncached page loads cost credits; cap them so a stranger can't burn the daily quota.
const recentPageLoads: number[] = [];
export function checkNewsRateLimit(): void {
  const now = Date.now();
  while (recentPageLoads.length && now - recentPageLoads[0] > 60 * 60_000) recentPageLoads.shift();
  if (recentPageLoads.length >= 40) throw new NewsError("Too many news requests right now. Try again in a few minutes.", 429);
  recentPageLoads.push(now);
}

export const __test = { clean, topicOf, isAboutZcash, parseDate };
