import type { Metadata } from "next";
import Link from "next/link";
import { DepositFlow } from "./DepositFlow";

export const metadata: Metadata = { title: "Add funds · Zorro" };

export default function DepositPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/bots/wallet" className="eyebrow hover:text-fox-light">
          ← Bot wallet
        </Link>
        <h1 className="page-title mt-3">Add funds</h1>
        <p className="page-lead">Fund your bot wallet with ZEC or USDC from your own wallet.</p>
      </header>
      <DepositFlow />
    </div>
  );
}
