import type { Metadata } from "next";
import { Suspense } from "react";
import { BotDetail } from "./BotDetail";

export const metadata: Metadata = { title: "Bot · Zorro" };

export default function BotPage({ params }: PageProps<"/bots/[id]">) {
  return (
    <Suspense fallback={<div className="panel h-64 animate-pulse" />}>
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: { params: PageProps<"/bots/[id]">["params"] }) {
  const { id } = await params;
  return <BotDetail id={id} />;
}
