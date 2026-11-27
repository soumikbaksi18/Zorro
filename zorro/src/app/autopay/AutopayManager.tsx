"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Pause, Play, Plus, Trash2, Zap } from "lucide-react";
import { api } from "@/lib/api-client";
import { useAccount } from "@/lib/account-client";
import { useCurrency } from "@/lib/client-prefs";
import { coin, displayAmount } from "@/lib/coins";
import { WEEKDAYS, amountLabel, describeSchedule, ordinal } from "@/lib/schedule-format";
import type { PayeeView } from "@/lib/payees";
import type { ScheduleView } from "@/lib/schedules";
import { PayeeAvatar } from "@/components/PayeeAvatar";
import { useFiat } from "@/components/money";
import { ErrorBox, Segmented } from "@/components/ui";
import { PasskeyGate } from "@/components/wallet/PasskeyGate";

export function AutopayManager() {
  const account = useAccount();
  const params = useSearchParams();
  const router = useRouter();
  const [schedules, setSchedules] = useState<ScheduleView[] | null>(null);
  const [payees, setPayees] = useState<PayeeView[] | null>(null);
  const [creating, setCreating] = useState(params.get("new") === "1");
  const [error, setError] = useState<string | null>(null);
  const { fmt } = useFiat();
  const hasWallet = account.status === "ready" && account.me.agent?.status === "ACTIVE";

  const load = useCallback(() => {
    api<ScheduleView[]>("/api/schedules")
      .then(setSchedules)
      .catch((e: Error) => setError(e.message));
    api<PayeeView[]>("/api/payees")
      .then(setPayees)
      .catch(() => setPayees([]));
  }, []);
  useEffect(() => {
    if (hasWallet) load();
  }, [hasWallet, load]);

  if (account.status === "loading") return <div className="panel h-64 animate-pulse" />;
  if (account.status !== "ready" || !account.me.user) return <PasskeyGate title="Sign in to set up Autopay" />;
  if (!hasWallet) {
    return (
      <div className="panel p-5 text-sm">
        Create your wallet first.{" "}
        <Link href="/wallet/setup" className="text-brand">
          Create wallet
        </Link>
      </div>
    );
  }

  async function act(s: ScheduleView, action: "pause" | "resume" | "delete" | "run_now") {
    if (action === "delete" && !confirm(`Delete the Autopay to ${s.payee.name}?`)) return;
    if (action === "run_now" && !confirm(`Pay ${s.payee.name} ${amountLabel(s.amount, s.currency, s.payee.coinKey)} now?`)) return;
    setError(null);
    try {
      const r = await api<{ paymentId?: string }>(`/api/schedules/${s.id}`, { action });
      if (r.paymentId) router.push(`/pay/${r.paymentId}`);
      else load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work");
    }
  }

  const approved = payees?.filter((p) => p.status === "approved") ?? [];
  const monthlyUsd = (schedules ?? []).filter((s) => s.status === "active").reduce((sum, s) => sum + (s.estimate ? (s.frequency === "weekly" ? s.estimate.usd * 4.35 : s.estimate.usd) : 0), 0);
  const monthlyInr = (schedules ?? []).filter((s) => s.status === "active").reduce((sum, s) => sum + (s.estimate ? (s.frequency === "weekly" ? s.estimate.inr * 4.35 : s.estimate.inr) : 0), 0);

  return (
    <div className="flex flex-col gap-6">
      {error && <ErrorBox message={error} />}

      {schedules && schedules.length > 0 && (
        <section className="glass-card p-5">
          <p className="text-sm font-medium text-brand-ink/70">Autopay each month</p>
          <p className="tabular mt-1 text-[32px] leading-tight font-semibold tracking-[-0.03em]">≈ {fmt(monthlyUsd, monthlyInr)}</p>
          <p className="mt-1 text-xs text-brand-ink/70">
            {schedules.filter((s) => s.status === "active").length} active · runs at 9:00 AM IST · converted from ZEC on the day
          </p>
        </section>
      )}

      {creating && payees === null ? (
        <div className="panel h-64 animate-pulse" />
      ) : creating ? (
        <NewSchedule
          payees={approved}
          preselect={params.get("payee")}
          initial={{
            amount: params.get("amount") ?? "",
            currency: params.get("currency"),
            frequency: params.get("frequency"),
            day: params.get("day"),
            note: params.get("note") ?? "",
          }}
          onDone={(created) => {
            setCreating(false);
            if (created) load();
          }}
        />
      ) : (
        <button type="button" onClick={() => setCreating(true)} className="btn-primary w-full">
          <Plus size={17} aria-hidden="true" /> New Autopay
        </button>
      )}

      <section aria-labelledby="sched-heading">
        <h2 id="sched-heading" className="section-title mb-3">
          Your Autopays
        </h2>
        {schedules === null ? (
          <div className="panel h-28 animate-pulse" />
        ) : schedules.length === 0 ? (
          <p className="panel p-5 text-sm text-muted">No Autopays yet. Set one up for rent, a family allowance or a monthly invoice.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {schedules.map((s) => (
              <li key={s.id} className={`panel p-4 ${s.status === "paused" ? "opacity-70" : ""}`}>
                <div className="flex items-center gap-3">
                  <PayeeAvatar name={s.payee.name} coinKey={s.payee.coinKey} size={44} />
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate font-medium">{s.payee.name}</strong>
                    <span className="block text-xs text-muted">
                      {describeSchedule(s)} · {s.status === "paused" ? "Paused" : `next ${new Date(s.nextRunAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
                    </span>
                  </div>
                  <div className="text-right">
                    <strong className="tabular block font-semibold">{amountLabel(s.amount, s.currency, s.payee.coinKey)}</strong>
                    {s.estimate && <span className="tabular block text-xs text-muted">≈ {displayAmount(s.estimate.zec)} ZEC</span>}
                  </div>
                </div>
                {s.note && <p className="mt-2 text-xs text-muted">{s.note}</p>}
                <div className="mt-3 flex gap-2 border-t border-line pt-3">
                  {s.status === "active" ? (
                    <SmallButton onClick={() => act(s, "pause")} icon={<Pause size={13} />} label="Pause" />
                  ) : (
                    <SmallButton onClick={() => act(s, "resume")} icon={<Play size={13} />} label="Resume" />
                  )}
                  <SmallButton onClick={() => act(s, "run_now")} icon={<Zap size={13} />} label="Pay now" />
                  <SmallButton onClick={() => act(s, "delete")} icon={<Trash2 size={13} />} label="Delete" danger />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SmallButton({ onClick, icon, label, danger }: { onClick: () => void; icon: React.ReactNode; label: string; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${danger ? "border-down/30 text-down hover:bg-down/10" : "border-line-strong hover:border-brand"}`}
    >
      {icon}
      {label}
    </button>
  );
}

type Initial = { amount: string; currency: string | null; frequency: string | null; day: string | null; note: string };

function NewSchedule({ payees, preselect, initial, onDone }: { payees: PayeeView[]; preselect: string | null; initial: Initial; onDone: (created: boolean) => void }) {
  const [pref] = useCurrency();
  const [picked, setPayeeId] = useState<string | null>(null);
  // Payees can arrive after the form opens: fall back to the requested one, then the first.
  const payeeId = picked ?? (preselect && payees.some((p) => p.id === preselect) ? preselect : (payees[0]?.id ?? ""));
  const [amount, setAmount] = useState(initial.amount);
  const [currency, setCurrency] = useState<"INR" | "USD" | "COIN">(initial.currency === "INR" || initial.currency === "USD" || initial.currency === "COIN" ? initial.currency : pref);
  const [frequency, setFrequency] = useState<"monthly" | "weekly">(initial.frequency === "weekly" ? "weekly" : "monthly");
  const [day, setDay] = useState(initial.day !== null && /^\d+$/.test(initial.day) ? Number(initial.day) : 1);
  const [note, setNote] = useState(initial.note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const payee = payees.find((p) => p.id === payeeId);

  if (payees.length === 0) {
    return (
      <div className="panel p-5 text-sm">
        Approve a payee first, then set up Autopay for them.{" "}
        <Link href="/payees" className="text-brand">
          Add a payee
        </Link>
      </div>
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/schedules", { payeeId, amount, currency, frequency, day, note: note.trim() || undefined });
      onDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the Autopay");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel flex flex-col gap-5 p-5" aria-labelledby="new-sched-heading">
      <h2 id="new-sched-heading" className="section-title flex items-center gap-2">
        <CalendarClock size={18} className="text-brand" aria-hidden="true" /> New Autopay
      </h2>
      <div>
        <p className="mb-2 text-sm font-medium">Pay</p>
        <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1" role="radiogroup" aria-label="Payee">
          {payees.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={payeeId === p.id}
              onClick={() => setPayeeId(p.id)}
              className={`flex w-[76px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border p-2 text-xs ${payeeId === p.id ? "border-brand bg-brand/10" : "border-transparent"}`}
            >
              <PayeeAvatar name={p.name} coinKey={p.coinKey} size={44} />
              <span className="w-full truncate">{p.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Amount</span>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" className="field tabular text-lg font-semibold" />
        </label>
        <div className="mt-2">
          <Segmented
            label="Amount is in"
            value={currency}
            onChange={setCurrency}
            options={[
              { value: "INR", label: "₹ INR" },
              { value: "USD", label: "$ USD" },
              { value: "COIN", label: payee ? coin(payee.coinKey).symbol : "Coin" },
            ]}
          />
        </div>
        <p className="mt-2 text-xs text-muted">{currency === "COIN" ? "They always get exactly this many coins." : "They get this value in their coin, at the price on the day."}</p>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">How often</p>
        <Segmented
          label="Frequency"
          value={frequency}
          onChange={(f) => {
            setFrequency(f);
            setDay(1);
          }}
          options={[
            { value: "monthly", label: "Monthly" },
            { value: "weekly", label: "Weekly" },
          ]}
        />
        {frequency === "weekly" ? (
          <div className="mt-3 grid grid-cols-7 gap-1.5" role="radiogroup" aria-label="Weekday">
            {WEEKDAYS.map((d, i) => (
              <button key={d} type="button" role="radio" aria-checked={day === i} onClick={() => setDay(i)} className={`rounded-xl py-2 text-xs font-medium ${day === i ? "bg-brand text-brand-ink" : "bg-surface text-muted"}`}>
                {d}
              </button>
            ))}
          </div>
        ) : (
          <label className="mt-3 flex items-center gap-3 text-sm">
            On the
            <select value={day} onChange={(e) => setDay(Number(e.target.value))} className="field w-24 text-sm">
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {ordinal(d)}
                </option>
              ))}
            </select>
            of every month
          </label>
        )}
      </div>
      <label className="block">
        <span className="mb-2 block text-sm font-medium">
          Note <span className="font-normal text-muted">· optional</span>
        </span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="e.g. Rent" className="field text-sm" />
      </label>
      {error && <ErrorBox message={error} />}
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={() => onDone(false)} className="btn-secondary">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={!payeeId || !/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0 || busy} className="btn-primary">
          {busy ? "Saving…" : "Start Autopay"}
        </button>
      </div>
      <p className="text-xs leading-relaxed text-dim">Runs at 9:00 AM IST within your daily limit. If your ZEC doesn&apos;t cover it, that run is skipped and shows in your Tracker.</p>
    </section>
  );
}
