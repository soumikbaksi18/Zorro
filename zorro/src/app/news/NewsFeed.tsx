"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  ExternalLink,
  Newspaper,
  RefreshCw,
  Search,
  Share2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import type { NewsArticle, NewsPage, NewsTopic } from "@/lib/news";
import type { NewsBrief } from "@/lib/news-brief";

type Filter = "all" | NewsTopic | "saved";

const TOPIC_LABEL: Record<NewsTopic, string> = {
  markets: "Price",
  tech: "Privacy & tech",
  ecosystem: "Ecosystem",
  general: "News",
};
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "markets", label: "Price" },
  { value: "tech", label: "Privacy & tech" },
  { value: "ecosystem", label: "Ecosystem" },
  { value: "saved", label: "Saved" },
];
const MOOD = {
  positive: { label: "Mostly positive", cls: "border-up/40 bg-up/10 text-up" },
  mixed: { label: "Mixed", cls: "border-gold/40 bg-gold/10 text-gold" },
  negative: { label: "Mostly negative", cls: "border-down/40 bg-down/10 text-down" },
} as const;

// ---------- Small client stores (no setState inside effects) ----------

const SAVED_KEY = "zorro.news.saved";
const savedListeners = new Set<() => void>();
let savedCache: { raw: string | null; list: NewsArticle[] } = { raw: null, list: [] };

function readSaved(): NewsArticle[] {
  const raw = localStorage.getItem(SAVED_KEY);
  if (raw !== savedCache.raw) {
    let list: NewsArticle[] = [];
    try {
      list = raw ? (JSON.parse(raw) as NewsArticle[]) : [];
    } catch {}
    savedCache = { raw, list: Array.isArray(list) ? list : [] };
  }
  return savedCache.list;
}
const EMPTY: NewsArticle[] = [];
function subscribeSaved(cb: () => void) {
  savedListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    savedListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function toggleSaved(article: NewsArticle) {
  const list = readSaved();
  const next = list.some((a) => a.id === article.id) ? list.filter((a) => a.id !== article.id) : [article, ...list].slice(0, 100);
  localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  savedListeners.forEach((l) => l());
}

// A clock that ticks once a minute, for "5m ago" labels.
let clockNow = 0;
function subscribeClock(cb: () => void) {
  const id = setInterval(() => {
    clockNow = Date.now();
    cb();
  }, 60_000);
  return () => clearInterval(id);
}
const readClock = () => (clockNow ||= Date.now());

function ago(iso: string, now: number): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  const d = Math.round(s / 86_400);
  return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

// ---------- Page ----------

export function NewsFeed() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [price, setPrice] = useState<{ zecUsd: number; change24hPct: number | null } | null>(null);
  const saved = useSyncExternalStore(subscribeSaved, readSaved, () => EMPTY);
  const now = useSyncExternalStore(subscribeClock, readClock, () => 0);

  function applyFirstPage(page: NewsPage) {
    setArticles(page.articles);
    setNextPage(page.nextPage);
    setFetchedAt(page.fetchedAt);
    setStatus("ready");
    setError(null);
  }

  useEffect(() => {
    getJson<NewsPage>("/api/news")
      .then(applyFirstPage)
      .catch((e: Error) => {
        setError(e.message);
        setStatus("error");
      });
    getJson<{ zecUsd: number; change24hPct: number | null }>("/api/price")
      .then(setPrice)
      .catch(() => {});
  }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      applyFirstPage(await getJson<NewsPage>("/api/news"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't refresh");
    } finally {
      setRefreshing(false);
    }
  }

  async function loadMore() {
    if (!nextPage) return;
    setLoadingMore(true);
    try {
      const page = await getJson<NewsPage>(`/api/news?page=${encodeURIComponent(nextPage)}`);
      setArticles((prev) => {
        const ids = new Set(prev.map((a) => a.id));
        return [...prev, ...page.articles.filter((a) => !ids.has(a.id))];
      });
      setNextPage(page.nextPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load more");
    } finally {
      setLoadingMore(false);
    }
  }

  const savedIds = useMemo(() => new Set(saved.map((a) => a.id)), [saved]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: articles.length, saved: saved.length };
    for (const a of articles) c[a.topic] = (c[a.topic] ?? 0) + 1;
    return c;
  }, [articles, saved]);

  const q = query.trim().toLowerCase();
  const visible = (filter === "saved" ? saved : articles).filter(
    (a) =>
      (filter === "all" || filter === "saved" || a.topic === filter) &&
      (!q || `${a.title} ${a.description ?? ""} ${a.source.name} ${a.keywords.join(" ")}`.toLowerCase().includes(q)),
  );
  const [featured, ...rest] = filter === "all" && !q ? visible : [undefined, ...visible];

  return (
    <div className="flex flex-col gap-5">
      <MarketStrip price={price} fetchedAt={fetchedAt} now={now} refreshing={refreshing} onRefresh={refresh} />
      <AiBrief disabled={status !== "ready" || articles.length < 2} />

      <div className="flex flex-col gap-3">
        <label className="relative block">
          <span className="sr-only">Search Zcash news</span>
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-dim" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search headlines, sources…"
            className="field pr-10 pl-10 text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted hover:text-snow"
            >
              <X size={15} />
            </button>
          )}
        </label>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="group" aria-label="Topics">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              aria-pressed={filter === f.value}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                filter === f.value ? "border-brand bg-brand text-brand-ink" : "border-line bg-panel text-muted hover:text-snow"
              }`}
            >
              {f.label}
              {(counts[f.value] ?? 0) > 0 && <span className="ml-1.5 opacity-70">{counts[f.value]}</span>}
            </button>
          ))}
        </div>
      </div>

      {status === "loading" && (
        <div className="flex flex-col gap-3" aria-label="Loading news">
          <div className="panel h-64 animate-pulse" />
          <div className="panel h-28 animate-pulse" />
          <div className="panel h-28 animate-pulse" />
        </div>
      )}

      {status === "error" && (
        <div className="panel flex flex-col items-center gap-3 p-6 text-center">
          <Newspaper size={22} className="text-dim" aria-hidden="true" />
          <p className="text-sm">{error}</p>
          <button type="button" onClick={refresh} className="btn-secondary min-h-10 px-5 text-[13px]">
            Try again
          </button>
        </div>
      )}

      {status === "ready" && (
        <>
          {featured && (
            <FeaturedCard article={featured} now={now} saved={savedIds.has(featured.id)} />
          )}
          {rest.length > 0 && (
            <ul className="flex flex-col gap-3">
              {rest.map((a) => a && (
                <li key={a.id}>
                  <ArticleCard article={a} now={now} saved={savedIds.has(a.id)} />
                </li>
              ))}
            </ul>
          )}
          {visible.length === 0 && (
            <p className="panel p-6 text-center text-sm text-muted">
              {filter === "saved" && !q
                ? "Nothing saved yet. Tap the bookmark on a story to keep it here."
                : q
                  ? `No stories match “${query.trim()}”.`
                  : "No stories in this topic right now."}
            </p>
          )}
          {error && <p className="text-center text-sm text-down">{error}</p>}
          {filter !== "saved" && nextPage && (
            <button type="button" onClick={loadMore} disabled={loadingMore} className="btn-secondary min-h-11 w-full text-[13px]">
              {loadingMore ? "Loading…" : "Load older stories"}
            </button>
          )}
        </>
      )}

      <p className="text-[11px] leading-relaxed text-dim">
        Only stories about Zcash and ZEC, refreshed every 30 minutes (the free news feed can lag by up to a day). Opening a
        story takes you to the publisher&apos;s site. Nothing here is financial advice.
      </p>
    </div>
  );
}

// ---------- Pieces ----------

function MarketStrip({
  price,
  fetchedAt,
  now,
  refreshing,
  onRefresh,
}: {
  price: { zecUsd: number; change24hPct: number | null } | null;
  fetchedAt: string | null;
  now: number;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const up = (price?.change24hPct ?? 0) >= 0;
  return (
    <section className="panel flex items-center justify-between gap-3 px-4 py-3" aria-label="ZEC price and news freshness">
      <div className="tabular flex items-center gap-2.5">
        <span className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">ZEC</span>
        <span className="text-base">{price ? `$${price.zecUsd.toFixed(2)}` : "—"}</span>
        {price?.change24hPct != null && (
          <span className={`flex items-center gap-0.5 text-xs ${up ? "text-up" : "text-down"}`}>
            {up ? <TrendingUp size={13} aria-hidden="true" /> : <TrendingDown size={13} aria-hidden="true" />}
            {up ? "+" : ""}
            {price.change24hPct.toFixed(1)}%
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="flex items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[10px] tracking-[0.1em] text-muted uppercase hover:text-snow"
      >
        <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />
        {fetchedAt && now ? `Updated ${ago(fetchedAt, now)}` : "Refresh"}
      </button>
    </section>
  );
}

function AiBrief({ disabled }: { disabled: boolean }) {
  const [brief, setBrief] = useState<NewsBrief | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      setBrief(await getJson<NewsBrief>("/api/news/brief"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't summarise");
    } finally {
      setBusy(false);
    }
  }

  if (!brief) {
    return (
      <div>
        <button
          type="button"
          onClick={load}
          disabled={disabled || busy}
          className="panel-hero flex w-full items-center gap-3 p-4 text-left transition-colors hover:border-brand/60 disabled:opacity-60"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/20 text-brand-light">
            <Sparkles size={18} className={busy ? "animate-pulse" : ""} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <strong className="block text-sm font-medium">{busy ? "Reading the headlines…" : "Zcash today in 30 seconds"}</strong>
            <span className="text-xs text-muted">AI summary of the latest stories</span>
          </span>
        </button>
        {error && <p className="mt-2 text-sm text-down">{error}</p>}
      </div>
    );
  }

  const mood = MOOD[brief.mood];
  return (
    <section className="panel-hero p-5" aria-labelledby="brief-heading" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <h2 id="brief-heading" className="eyebrow flex items-center gap-2">
          <Sparkles size={13} className="text-brand-light" aria-hidden="true" /> Zcash today
        </h2>
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] ${mood.cls}`}>{mood.label}</span>
      </div>
      <p className="mt-3 text-sm leading-relaxed">{brief.summary}</p>
      <ul className="mt-3 flex flex-col gap-1.5 text-xs leading-relaxed text-snow/85">
        {brief.points.map((p) => (
          <li key={p} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-light" aria-hidden="true" />
            {p}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-dim">
        AI-powered summary of {brief.basedOn} headlines. It can miss details: read the stories. Not financial advice.
      </p>
    </section>
  );
}

function SourceLine({ article, now }: { article: NewsArticle; now: number }) {
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
      {article.source.icon && (
        // eslint-disable-next-line @next/next/no-img-element -- publisher favicons come from arbitrary domains
        <img src={article.source.icon} alt="" width={14} height={14} loading="lazy" referrerPolicy="no-referrer" className="h-3.5 w-3.5 rounded-sm" />
      )}
      <span className="truncate">{article.source.name}</span>
      {now > 0 && (
        <>
          <span aria-hidden="true">·</span>
          <time dateTime={article.publishedAt} className="shrink-0">
            {ago(article.publishedAt, now)}
          </time>
        </>
      )}
    </p>
  );
}

function Actions({ article, saved }: { article: NewsArticle; saved: boolean }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (navigator.share) {
      await navigator.share({ title: article.title, url: article.link }).catch(() => {});
      return;
    }
    await navigator.clipboard?.writeText(article.link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex items-center gap-1">
      <a
        href={article.link}
        target="_blank"
        rel="noopener noreferrer"
        className="mr-auto flex items-center gap-1.5 rounded-full bg-brand/15 px-3 py-1.5 text-xs font-medium text-brand-light hover:bg-brand/25"
      >
        Read story <ExternalLink size={12} aria-hidden="true" />
      </a>
      <button
        type="button"
        onClick={share}
        aria-label="Share story"
        className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-panel hover:text-snow"
      >
        {copied ? <span className="text-[10px] text-up">Copied</span> : <Share2 size={16} aria-hidden="true" />}
      </button>
      <button
        type="button"
        onClick={() => toggleSaved(article)}
        aria-pressed={saved}
        aria-label={saved ? "Remove from saved" : "Save story"}
        className={`grid h-9 w-9 place-items-center rounded-full hover:bg-panel ${saved ? "text-gold" : "text-muted hover:text-snow"}`}
      >
        {saved ? <BookmarkCheck size={16} aria-hidden="true" /> : <Bookmark size={16} aria-hidden="true" />}
      </button>
    </div>
  );
}

function TopicPill({ topic }: { topic: NewsTopic }) {
  return (
    <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[9px] tracking-[0.12em] text-muted uppercase">
      {TOPIC_LABEL[topic]}
    </span>
  );
}

function FeaturedCard({ article, now, saved }: { article: NewsArticle; now: number; saved: boolean }) {
  const [imageOk, setImageOk] = useState(true);
  return (
    <article className="panel overflow-hidden">
      {article.imageUrl && imageOk && (
        // eslint-disable-next-line @next/next/no-img-element -- news images come from arbitrary publisher domains
        <img
          src={article.imageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImageOk(false)}
          className="aspect-[16/9] w-full object-cover"
        />
      )}
      <div className="flex flex-col gap-2.5 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="eyebrow text-[9px] text-brand-light">Top story</span>
          <TopicPill topic={article.topic} />
        </div>
        <h2 className="text-lg leading-snug font-medium tracking-[-0.01em]">
          <a href={article.link} target="_blank" rel="noopener noreferrer" className="hover:text-brand-light">
            {article.title}
          </a>
        </h2>
        <SourceLine article={article} now={now} />
        {article.description && <p className="line-clamp-3 text-sm leading-relaxed text-snow/75">{article.description}</p>}
        <Actions article={article} saved={saved} />
      </div>
    </article>
  );
}

function ArticleCard({ article, now, saved }: { article: NewsArticle; now: number; saved: boolean }) {
  const [open, setOpen] = useState(false);
  const [imageOk, setImageOk] = useState(true);
  const id = `story-${article.id}`;
  return (
    <article className="panel p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-start gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <SourceLine article={article} now={now} />
          <h3 className="mt-1.5 text-sm leading-snug font-medium">{article.title}</h3>
          <div className="mt-2 flex items-center gap-2">
            <TopicPill topic={article.topic} />
            <ChevronDown size={14} className={`text-dim transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
          </div>
        </div>
        {article.imageUrl && imageOk && (
          // eslint-disable-next-line @next/next/no-img-element -- news images come from arbitrary publisher domains
          <img
            src={article.imageUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageOk(false)}
            className="h-16 w-16 shrink-0 rounded-lg object-cover"
          />
        )}
      </button>
      <div id={id} hidden={!open} className="mt-3 border-t border-line pt-3">
        <p className="text-sm leading-relaxed text-snow/80">{article.description ?? "No summary from the publisher. Open the story to read it."}</p>
        {article.keywords.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-1.5">
            {article.keywords.map((k) => (
              <span key={k} className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-muted">
                #{k}
              </span>
            ))}
          </p>
        )}
      </div>
      <div className="mt-3">
        <Actions article={article} saved={saved} />
      </div>
    </article>
  );
}
