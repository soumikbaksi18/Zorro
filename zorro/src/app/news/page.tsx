import type { Metadata } from "next";
import { NewsFeed } from "./NewsFeed";

export const metadata: Metadata = { title: "Zcash news · Zorro" };

export default function NewsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="eyebrow">News</p>
        <h1 className="page-title mt-3">Zcash news</h1>
        <p className="page-lead">The latest on Zcash and ZEC, and nothing else.</p>
      </header>
      <NewsFeed />
    </div>
  );
}
