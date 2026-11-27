import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { NewsFeed } from "./NewsFeed";

export const metadata: Metadata = { title: "Zcash news · Zorro" };

export default function NewsPage() {
  return (
    <>
      <PageHeader title="Zcash news" lead="The latest on Zcash and ZEC, and nothing else." />
      <NewsFeed />
    </>
  );
}
