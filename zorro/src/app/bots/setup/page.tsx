import type { Metadata } from "next";
import Link from "next/link";
import { SetupFlow } from "./SetupFlow";

export const metadata: Metadata = { title: "Set up your bot wallet · Zorro" };

export default function SetupPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/bots" className="eyebrow hover:text-fox-light">
          ← Bots
        </Link>
        <h1 className="page-title mt-3">Set your limits</h1>
        <p className="page-lead">
          These rules are signed with your passkey and enforced by NEAR Intents, not by Zorro.
        </p>
      </header>
      <SetupFlow />
    </div>
  );
}
