"use client";

import Link from "next/link";
import { useState } from "react";
import { MessageCircleQuestion, Sparkles, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api-client";
import { useAccount } from "@/lib/account-client";
import type { PaymentDraft } from "@/lib/ai-payments";
import { PayeeAvatar } from "@/components/PayeeAvatar";
import { ErrorBox } from "@/components/ui";
import { PasskeyGate } from "@/components/wallet/PasskeyGate";
import { amountLabel, describeSchedule } from "@/lib/schedule-format";

const EXAMPLES = ["Pay my landlord ₹15,000 on the 1st of every month", "Send Riya $20 now", "Pay Arjun 500 rupees every Friday", "Send 0.05 ZEC to my Zcash wallet"];

export function AskFlow() {
  const account = useAccount();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<PaymentDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (account.status === "loading") return <div className="panel h-48 animate-pulse" />;
  if (account.status !== "ready" || !account.me.user) return <PasskeyGate title="Sign in to use the assistant" />;
  if (account.me.agent?.status !== "ACTIVE") {
    return (
      <div className="panel p-5 text-sm">
        Create your wallet first.{" "}
        <Link href="/wallet/setup" className="text-zec">
          Create wallet
        </Link>
      </div>
    );
  }

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      setDraft(await api<PaymentDraft>("/api/ai/payment", { text }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The assistant didn't answer");
    } finally {
      setBusy(false);
    }
  }

  const reviewHref =
    draft?.status === "ok"
      ? draft.action === "pay"
        ? `/pay?${new URLSearchParams({ to: draft.payeeId, amount: draft.amount, currency: draft.currency })}`
        : `/autopay?${new URLSearchParams({ new: "1", payee: draft.payeeId, amount: draft.amount, currency: draft.currency, frequency: draft.frequency ?? "monthly", day: String(draft.day ?? 1), ...(draft.note ? { note: draft.note } : {}) })}`
      : null;

  return (
    <div className="flex flex-col gap-5">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={400}
        placeholder="e.g. Pay my landlord ₹15,000 on the 1st of every month"
        aria-label="What do you want to pay?"
        className="field min-h-28 resize-none py-3.5 text-[15px] leading-relaxed"
      />
      <div className="flex flex-wrap gap-2" aria-label="Examples">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" onClick={() => setText(ex)} className="chip">
            {ex}
          </button>
        ))}
      </div>
      <button type="button" onClick={ask} disabled={busy || text.trim().length < 4} className="btn-primary w-full">
        <Sparkles size={16} aria-hidden="true" /> {busy ? "Thinking…" : "Draft it"}
      </button>
      {error && <ErrorBox message={error} />}

      {draft?.status === "clarify" && (
        <section className="panel flex gap-3 p-4" aria-live="polite">
          <MessageCircleQuestion size={18} className="mt-0.5 shrink-0 text-zec" aria-hidden="true" />
          <p className="text-sm">{draft.question}</p>
        </section>
      )}
      {draft?.status === "unsupported" && (
        <section className="panel flex gap-3 p-4" aria-live="polite">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-gold" aria-hidden="true" />
          <p className="text-sm">{draft.reason}</p>
        </section>
      )}
      {draft?.status === "ok" && reviewHref && (
        <section className="glass-card p-5" aria-live="polite">
          <p className="text-sm font-medium text-zec-ink/70">{draft.action === "pay" ? "Payment draft" : "Autopay draft"}</p>
          <div className="mt-3 flex items-center gap-3">
            <PayeeAvatar name={draft.payeeName} coinKey={draft.coinKey} size={46} />
            <div>
              <p className="text-xl font-semibold">{amountLabel(draft.amount, draft.currency, draft.coinKey)}</p>
              <p className="text-sm text-zec-ink/75">
                to {draft.payeeName}
                {draft.action === "autopay" && draft.frequency && draft.day !== null ? ` · ${describeSchedule({ frequency: draft.frequency, day: draft.day })}` : ""}
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm text-zec-ink/80">{draft.explanation}</p>
          <Link href={reviewHref} className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-zec-ink text-sm font-semibold text-zec">
            Review &amp; confirm
          </Link>
        </section>
      )}

      <p className="text-xs leading-relaxed text-dim">
        AI-powered. Only your words and your payees&apos; names go to a third-party AI service, never addresses, balances or keys. It only drafts: you confirm every payment.
      </p>
    </div>
  );
}
