import type { Metadata } from "next";
import Link from "next/link";
import { AssistantFlow } from "./AssistantFlow";

export const metadata: Metadata = { title: "AI assistant · Zorro" };

export default function AssistantPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/bots" className="eyebrow hover:text-fox-light">
          ← Bots
        </Link>
        <h1 className="page-title mt-3">Describe a bot in words</h1>
        <p className="page-lead">Zorro turns it into a bot, shows what it would have done recently, and lets you start it.</p>
      </header>
      <AssistantFlow />
    </div>
  );
}
