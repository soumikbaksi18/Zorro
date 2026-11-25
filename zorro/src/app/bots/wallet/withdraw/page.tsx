import type { Metadata } from "next";
import Link from "next/link";
import { WithdrawFlow } from "./WithdrawFlow";

export const metadata: Metadata = { title: "Withdraw · Zorro" };

export default function WithdrawPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/bots/wallet" className="eyebrow hover:text-fox-light">
          ← Bot wallet
        </Link>
        <h1 className="page-title mt-3">Withdraw</h1>
        <p className="page-lead">Funds can only go to the addresses in your signed limits.</p>
      </header>
      <WithdrawFlow />
    </div>
  );
}
