import type { Metadata } from "next";
import Link from "next/link";
import { NewBotForm } from "./NewBotForm";

export const metadata: Metadata = { title: "New bot · Zorro" };

export default function NewBotPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/bots" className="eyebrow hover:text-fox-light">
          ← Bots
        </Link>
        <h1 className="page-title mt-3">New bot</h1>
        <p className="page-lead">
          Try it on paper first: real quotes, no money moved. Or{" "}
          <Link href="/assistant" className="text-fox-light">
            describe it in words
          </Link>
          .
        </p>
      </header>
      <NewBotForm />
    </div>
  );
}
