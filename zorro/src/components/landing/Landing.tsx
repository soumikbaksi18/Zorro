"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  EyeOff,
  Fingerprint,
  HandCoins,
  QrCode,
  Repeat,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useAccount } from "@/lib/account-client";
import { COINS } from "@/lib/coins";
import { CoinBadge } from "@/components/money";
import { BrandMark } from "@/components/shell/Brand";
import { PasskeyGate } from "@/components/wallet/PasskeyGate";
import { CountUp, Reveal, Typewriter } from "./motion";

const v = (vars: Record<string, string | number>) => vars as CSSProperties;

/** The phone landing page: what Zorro is, shown with motion, ending in "create your passkey". */
export function Landing() {
  return (
    <div className="flex flex-col gap-24 pb-6">
      <Hero />
      <HowItWorks />
      <SlideDemo />
      <Features />
      <CoinTicker />
      <Stats />
      <Privacy />
      <Faq />
      <FinalCta />
    </div>
  );
}

// ---------- Hero ----------

function Hero() {
  const account = useAccount();
  const signedIn = account.status === "ready" && Boolean(account.me.user);
  return (
    <section aria-labelledby="hero-heading" className="relative">
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-2.5">
          <span className="anim-float inline-block">
            <BrandMark size={42} />
          </span>
          <span className="text-lg font-semibold tracking-[-0.03em]">Zorro</span>
        </span>
        <Link href={signedIn ? "/" : "#start"} className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium backdrop-blur hover:border-brand">
          {signedIn ? "Open app" : "Sign in"}
        </Link>
      </header>

      <Reveal className="mt-10">
        <p className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
          <span className="relative flex h-2 w-2">
            <span className="anim-ring absolute inset-0 rounded-full bg-brand" />
            <span className="relative h-2 w-2 rounded-full bg-brand" />
          </span>
          Built for Zcash India
        </p>
      </Reveal>
      <Reveal delay={100}>
        <h1 id="hero-heading" className="mt-5 text-[44px] leading-[1.05] font-semibold tracking-[-0.045em]">
          Private cash.
          <br />
          Pay in{" "}
          <span className="word-rotator text-brand">
            <span>
              <span>USDC.</span>
              <span>SOL.</span>
              <span>BTC.</span>
              <span>anything.</span>
              <span>USDC.</span>
            </span>
          </span>
        </h1>
      </Reveal>
      <Reveal delay={200}>
        <p className="mt-4 text-[16px] leading-relaxed text-snow/70">
          Hold ZEC. Pay anyone in the coin they want. Zorro converts at the moment you pay, through NEAR Intents, and tracks every rupee.
        </p>
      </Reveal>
      <Reveal delay={300} className="mt-7 flex gap-3">
        <a href={signedIn ? "/" : "#start"} className="btn-primary flex-1">
          {signedIn ? "Open Zorro" : "Get started"} <ArrowRight size={17} aria-hidden="true" />
        </a>
        <a href="#how" className="btn-secondary flex-1">
          How it works
        </a>
      </Reveal>

      <Reveal delay={350} className="relative mt-14 flex justify-center">
        <PhoneMock />
      </Reveal>
    </section>
  );
}

function PhoneMock() {
  const orbit = ["usdc-base", "sol", "btc", "eth", "usdt-tron", "near"];
  return (
    <div className="relative" aria-label="Zorro on a phone: a balance and recent payments" role="img">
      <div className="anim-glow pointer-events-none absolute -inset-10 rounded-full bg-[radial-gradient(circle,rgba(184,243,107,0.35),transparent_65%)]" aria-hidden="true" />
      {/* coins orbiting the phone */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-0 w-0" aria-hidden="true">
        {orbit.map((k, i) => (
          <span key={k} className="anim-orbit absolute -mt-[17px] -ml-[17px] block" style={v({ "--d": `${(-i * 20) / orbit.length}s`, "--t": "20s", "--rad": i % 2 ? "172px" : "150px" })}>
            <span className="block rounded-full shadow-[0_8px_20px_-6px_rgba(0,0,0,0.8)]">
              <CoinBadge coinKey={k} size={34} />
            </span>
          </span>
        ))}
      </div>

      <div className="anim-float relative h-[470px] w-[240px] rounded-[44px] border-[6px] border-[#1d2a20] bg-ink p-3 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)]" style={v({ "--r": "-2deg" })}>
        <div className="mx-auto h-5 w-20 rounded-full bg-black" />
        <div className="mt-3 flex items-center justify-between px-1">
          <BrandMark size={26} />
          <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10">
            <Bell size={13} />
          </span>
        </div>
        <p className="mt-3 px-1 text-[15px] font-medium">Hi, @riya</p>
        <div className="glass-card anim-shimmer mt-3 p-3.5">
          <p className="w-fit rounded-full bg-white/55 px-2 py-0.5 text-[9px] font-semibold">Main wallet (ZEC)</p>
          <p className="mt-5 text-[22px] leading-none font-semibold tracking-[-0.03em]">
            <CountUp to={48250.6} decimals={2} prefix="₹" duration={1800} />
          </p>
          <p className="mt-1 text-[9px] font-medium text-brand-ink/70">0.6942 ZEC</p>
        </div>
        <p className="mt-4 px-1 text-[11px] font-medium text-snow/70">Transactions</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {[
            { name: "Riya", sub: "USDC · Base", amt: "−₹500", out: true },
            { name: "Landlord", sub: "Autopay · USDT", amt: "−₹16,640", out: true },
            { name: "Logo design", sub: "Payment link", amt: "+₹250", out: false },
          ].map((r, i) => (
            <Reveal key={r.name} delay={600 + i * 180} as="li" className="flex items-center gap-2 rounded-2xl bg-white/[0.06] p-2">
              <span className={`grid h-7 w-7 place-items-center rounded-full ${r.out ? "border border-white/25" : "bg-brand text-brand-ink"}`}>
                {r.out ? <ArrowUpRight size={12} /> : <ArrowDownLeft size={12} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[10px] font-medium">{r.name}</span>
                <span className="block truncate text-[8px] text-snow/50">{r.sub}</span>
              </span>
              <span className={`text-[10px] font-semibold ${r.out ? "" : "text-brand"}`}>{r.amt}</span>
            </Reveal>
          ))}
        </ul>
        <div className="absolute inset-x-3 bottom-3 flex h-10 items-center justify-around rounded-full bg-[#111913]">
          <span className="h-6 w-6 rounded-full bg-snow" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
          <span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-brand-ink">
            <ArrowUpRight size={14} />
          </span>
          <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
        </div>
      </div>
    </div>
  );
}

// ---------- How it works ----------

function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-heading" className="scroll-mt-6">
      <Reveal>
        <p className="eyebrow text-brand">How it works</p>
        <h2 id="how-heading" className="mt-3 text-[32px] leading-tight font-semibold tracking-[-0.04em]">
          Three steps.
          <br />
          No seed phrase.
        </h2>
      </Reveal>

      <div className="mt-8 flex flex-col gap-4">
        <Reveal className="panel-hero overflow-hidden p-5">
          <Step n="01" title="Hold ZEC as private cash" body="One Face ID creates your wallet. Your balance is private on NEAR Intents, not on a public explorer." />
          <div className="mt-5 flex items-center gap-3 rounded-2xl bg-white/[0.05] p-3">
            <span className="relative">
              <span className="anim-ring absolute inset-0 rounded-full bg-brand/40" />
              <span className="relative">
                <CoinBadge coinKey="zec" size={40} />
              </span>
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold">0.6942 ZEC</span>
              <span className="flex items-center gap-1 text-xs text-snow/60">
                <EyeOff size={12} aria-hidden="true" /> Hidden from the public
              </span>
            </span>
            <ShieldCheck size={20} className="text-brand" aria-hidden="true" />
          </div>
        </Reveal>

        <Reveal delay={80} className="panel-hero overflow-hidden p-5">
          <Step n="02" title="Pay in any coin" body="Riya wants USDC on Base? Zorro converts your ZEC at the moment you pay and sends her the exact amount." />
          <div className="mt-6 flex items-center gap-3">
            <div className="flex flex-col items-center gap-1.5">
              <CoinBadge coinKey="zec" size={44} />
              <span className="tabular text-[11px] font-semibold">0.0073 ZEC</span>
            </div>
            <div className="relative h-0 flex-1 -translate-y-3 border-t-2 border-dashed border-white/20" aria-hidden="true">
              {[0, 0.7, 1.4].map((d) => (
                <span key={d} className="anim-travel absolute -top-[5px] -ml-1 block h-2 w-2 rounded-full bg-brand shadow-[0_0_10px_rgba(184,243,107,0.9)]" style={v({ "--d": `${d}s` })} />
              ))}
              <span className="absolute -top-6 left-1/2 -translate-x-1/2 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-brand">NEAR Intents</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <CoinBadge coinKey="usdc-base" size={44} />
              <span className="tabular text-[11px] font-semibold">5.41 USDC</span>
            </div>
          </div>
        </Reveal>

        <Reveal delay={160} className="panel-hero overflow-hidden p-5">
          <Step n="03" title="Track every rupee" body="Each payment gets a receipt: what they got, what it cost you in ZEC, the rate and fees. Export it any time." />
          <div className="relative mt-5 h-[150px]">
            {[
              { t: "Riya", a: "₹500.00", tag: "ZEC → USDC", c: "bg-tint-1" },
              { t: "Landlord", a: "₹16,640", tag: "ZEC → USDT", c: "bg-tint-2" },
              { t: "Coffee shop", a: "₹296.00", tag: "ZEC → USDC", c: "bg-tint-3" },
            ].map((r, i) => (
              <div
                key={r.t}
                className={`anim-drop absolute inset-x-0 rounded-[22px] px-4 py-3 text-brand-ink shadow-[0_-10px_24px_-14px_rgba(0,0,0,0.7)] ${r.c}`}
                style={v({ top: `${i * 38}px`, "--d": `${0.2 + i * 0.25}s`, zIndex: i })}
              >
                <div className="flex items-center justify-between text-[11px] font-medium text-brand-ink/60">
                  <span>{r.t}</span>
                  <span>{r.tag}</span>
                </div>
                <p className="tabular mt-0.5 text-[22px] leading-tight font-semibold tracking-[-0.03em]">{r.a}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <span className="font-mono text-xs font-semibold text-brand">{n}</span>
      <h3 className="mt-1 text-xl font-semibold tracking-[-0.02em]">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-snow/65">{body}</p>
    </div>
  );
}

// ---------- Slide to pay demo ----------

function SlideDemo() {
  return (
    <section aria-labelledby="slide-heading">
      <Reveal className="sheet-light p-5">
        <h2 id="slide-heading" className="text-[26px] leading-tight font-semibold tracking-[-0.03em]">
          Slide.
          <br />
          <span className="pl-8">Paid.</span>
        </h2>
        <div className="sheet-box mt-4 p-4">
          <div className="flex items-center justify-between text-[13px] text-brand-ink/65">
            <span>You send</span>
            <span>Riya gets</span>
          </div>
          <div className="tabular mt-1 flex items-center justify-between text-xl font-semibold">
            <span>₹500</span>
            <ArrowRight size={16} className="text-brand-ink/50" aria-hidden="true" />
            <span>5.41 USDC</span>
          </div>
          <div className="mt-3 flex justify-between border-t border-brand-ink/10 pt-3 text-[12px]">
            <span className="text-brand-ink/60">Fee</span>
            <span className="font-semibold">≈ ₹3</span>
          </div>
        </div>
        <div className="relative mx-auto mt-5 flex h-[64px] w-[300px] max-w-full items-center rounded-full bg-[#1b241d] p-1.5" aria-hidden="true" style={v({ "--travel": "232px" })}>
          <div className="demo-fill absolute inset-y-1.5 left-1.5 rounded-full bg-brand/25" />
          <span className="demo-knob relative z-10 grid h-[52px] w-[52px] place-items-center rounded-full bg-brand text-brand-ink">
            <ArrowRight size={20} />
          </span>
          <span className="demo-label absolute inset-0 flex items-center justify-center pl-12 text-sm font-medium text-snow/85">Slide to pay ₹500</span>
          <span className="demo-done absolute inset-0 flex items-center justify-center gap-2 text-sm font-semibold text-brand">
            <Check size={18} /> Paid
          </span>
        </div>
        <p className="mt-4 text-center text-xs font-medium text-brand-ink/65">No accidental taps. No extra Face ID within your daily limit.</p>
      </Reveal>
    </section>
  );
}

// ---------- Features ----------

const FEATURES: { title: string; body: string; icon: LucideIcon; anim: string }[] = [
  { title: "Autopay", body: "Rent on the 1st, family every Friday. Converted on the day.", icon: Repeat, anim: "anim-spin-slow" },
  { title: "Get paid in anything", body: "Share a link. They pay in any coin, it lands as ZEC.", icon: HandCoins, anim: "anim-float" },
  { title: "Scan to pay", body: "Point at a checkout QR: Zcash, Ethereum, Solana or Bitcoin.", icon: ScanLine, anim: "" },
  { title: "Zorro to Zorro", body: "Pay @friends instantly and privately. No network fee.", icon: Zap, anim: "anim-flash" },
  { title: "Face ID payees", body: "Money can only go to people you approved. Even if our server is hacked.", icon: Fingerprint, anim: "" },
  { title: "Get paid links", body: "A QR and a link for every invoice, with live status.", icon: QrCode, anim: "" },
];

function Features() {
  return (
    <section aria-labelledby="features-heading">
      <Reveal>
        <p className="eyebrow text-brand">Everything money needs</p>
        <h2 id="features-heading" className="mt-3 text-[32px] leading-tight font-semibold tracking-[-0.04em]">
          Spend ZEC like cash.
        </h2>
      </Reveal>

      <Reveal delay={80} className="glass-card-dark mt-6 p-5">
        <span className="flex items-center gap-2 text-sm font-semibold text-brand">
          <Sparkles size={16} aria-hidden="true" /> Ask Zorro
        </span>
        <p className="mt-3 min-h-[3.2em] text-[19px] leading-snug font-medium">
          <Typewriter text="Pay Riya ₹500 in USDC every Friday" />
        </p>
        <div className="mt-3 flex items-center gap-2 text-xs text-snow/60">
          <Check size={14} className="text-brand" aria-hidden="true" /> AI drafts it. You confirm it. Nothing moves until you do.
        </div>
      </Reveal>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {FEATURES.map(({ title, body, icon: Icon, anim }, i) => (
          <Reveal key={title} delay={i * 70} className="panel relative overflow-hidden p-4">
            <span className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-brand/12 text-brand">
              {title === "Face ID payees" && <span className="anim-ring absolute inset-0 rounded-2xl border border-brand/60" />}
              {title === "Scan to pay" && <span className="anim-scan absolute inset-x-1.5 h-[2px] rounded bg-brand shadow-[0_0_8px_rgba(184,243,107,0.9)]" />}
              {title === "Get paid links" && <span className="anim-shimmer absolute inset-0" />}
              <Icon size={20} className={anim} aria-hidden="true" />
            </span>
            <h3 className="mt-3 text-[15px] font-semibold">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-snow/60">{body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ---------- Coins ----------

function CoinTicker() {
  const row = [...COINS, ...COINS];
  return (
    <section aria-labelledby="coins-heading" className="-mx-5 overflow-hidden">
      <Reveal className="px-5">
        <h2 id="coins-heading" className="text-center text-[26px] leading-tight font-semibold tracking-[-0.03em]">
          13 coins. 8 chains.
          <br />
          <span className="text-brand">One balance.</span>
        </h2>
      </Reveal>
      <div className="mt-7 flex flex-col gap-3" aria-hidden="true">
        {[false, true].map((reverse) => (
          <div key={String(reverse)} className={`flex w-max gap-3 ${reverse ? "anim-marquee-reverse" : "anim-marquee"}`}>
            {(reverse ? [...row].reverse() : row).map((c, i) => (
              <span key={`${c.key}-${i}`} className="flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.05] py-1.5 pr-4 pl-1.5">
                <CoinBadge coinKey={c.key} size={28} />
                <span className="text-sm font-medium whitespace-nowrap">{c.symbol}</span>
                <span className="text-xs whitespace-nowrap text-snow/50">{c.chainName}</span>
              </span>
            ))}
          </div>
        ))}
      </div>
      <p className="sr-only">Supported: {COINS.map((c) => `${c.symbol} on ${c.chainName}`).join(", ")}.</p>
    </section>
  );
}

// ---------- Stats ----------

function Stats() {
  const items = [
    { to: 13, label: "coins to pay in" },
    { to: 8, label: "chains" },
    { to: 5, label: "seconds to approve a payee", prefix: "~" },
    { to: 0, label: "seed phrases to lose" },
  ];
  return (
    <section aria-label="Zorro in numbers" className="grid grid-cols-2 gap-3">
      {items.map((s, i) => (
        <Reveal key={s.label} delay={i * 80} className="panel p-5">
          <p className="text-[40px] leading-none font-semibold tracking-[-0.04em] text-brand">
            {s.to === 0 ? "0" : <CountUp to={s.to} prefix={s.prefix ?? ""} />}
          </p>
          <p className="mt-2 text-xs leading-snug text-snow/60">{s.label}</p>
        </Reveal>
      ))}
    </section>
  );
}

// ---------- Privacy ----------

function Privacy() {
  const points = [
    "Strangers can't see your balance or who you pay.",
    "Zorro-to-Zorro payments never touch a public chain.",
    "Payees see what they received, never your wallet.",
  ];
  return (
    <section aria-labelledby="privacy-heading">
      <Reveal className="panel-hero relative overflow-hidden p-6">
        <div className="relative mx-auto grid h-24 w-24 place-items-center">
          <span className="anim-spin-slow absolute inset-0 rounded-full border-2 border-dashed border-brand/40" />
          <span className="absolute inset-3 rounded-full bg-brand/10" />
          <ShieldCheck size={38} className="relative text-brand" aria-hidden="true" />
        </div>
        <h2 id="privacy-heading" className="mt-5 text-center text-[26px] leading-tight font-semibold tracking-[-0.03em]">
          Private from the public.
        </h2>
        <ul className="mt-5 flex flex-col gap-3">
          {points.map((p, i) => (
            <Reveal key={p} delay={150 + i * 120} as="li" className="flex gap-3 text-sm leading-relaxed text-snow/80">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-brand-ink">
                <Check size={12} strokeWidth={3} />
              </span>
              {p}
            </Reveal>
          ))}
        </ul>
        <p className="mt-5 text-xs leading-relaxed text-snow/50">
          Honest note: ZEC enters and leaves through transparent addresses, and NEAR Intents holds your balance under the rules you sign. Keep long-term savings shielded in your Zcash wallet and use Zorro to spend.
        </p>
      </Reveal>
    </section>
  );
}

// ---------- FAQ ----------

const FAQ = [
  { q: "Is Zorro a bank or an exchange?", a: "No. Your wallet is an account on NEAR Intents that only your passkey controls. Zorro runs the payments you ask for, within rules you sign." },
  { q: "What does it cost?", a: "Zorro shows the exact cost before you pay: the conversion fee (about 0.6%) and the network fee. Zorro-to-Zorro payments have no network fee." },
  { q: "What if Zorro's server is hacked?", a: "Money can only go to payees you approved with Face ID, up to your daily limit. Nobody can add a payee without your passkey." },
  { q: "Can I pay someone who doesn't use Zorro?", a: "Yes. Pay any address on 8 chains in the coin they want, or send them a link to pay you in any coin." },
  { q: "Is it ready for my savings?", a: "Not yet. It runs on NEAR Intents' experimental Agent API. Keep spending money in Zorro and savings shielded in your Zcash wallet." },
];

function Faq() {
  return (
    <section aria-labelledby="faq-heading">
      <Reveal>
        <h2 id="faq-heading" className="text-[26px] leading-tight font-semibold tracking-[-0.03em]">
          Questions
        </h2>
      </Reveal>
      <div className="mt-5 flex flex-col gap-2.5">
        {FAQ.map(({ q, a }, i) => (
          <Reveal key={q} delay={i * 60}>
            <details className="group panel p-4 open:border-brand/40">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown size={18} className="shrink-0 text-snow/50 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-snow/65">{a}</p>
            </details>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ---------- Final call to action ----------

function FinalCta() {
  const account = useAccount();
  const signedIn = account.status === "ready" && Boolean(account.me.user);
  const hasWallet = account.status === "ready" && account.me.agent?.status === "ACTIVE";
  return (
    <section id="start" aria-labelledby="start-heading" className="scroll-mt-6">
      <Reveal className="relative text-center">
        <div className="anim-glow pointer-events-none absolute inset-x-0 -top-10 mx-auto h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(184,243,107,0.35),transparent_65%)]" aria-hidden="true" />
        <span className="anim-float relative inline-block">
          <BrandMark size={72} />
        </span>
        <h2 id="start-heading" className="relative mt-5 text-[34px] leading-[1.08] font-semibold tracking-[-0.04em]">
          Your ZEC,
          <br />
          <span className="text-brand">spendable everywhere.</span>
        </h2>
        <p className="relative mt-3 text-sm text-snow/65">Free to start. One Face ID. About a minute.</p>
      </Reveal>
      <Reveal delay={150} className="mt-7">
        {signedIn ? (
          <Link href={hasWallet ? "/" : "/wallet/setup"} className="btn-primary w-full">
            {hasWallet ? "Open Zorro" : "Create your wallet"} <ArrowRight size={17} aria-hidden="true" />
          </Link>
        ) : (
          <PasskeyGate title="Start with a passkey" />
        )}
      </Reveal>
      <footer className="mt-14 flex flex-col items-center gap-1 text-center text-[11px] text-snow/40">
        <span>Built for the Zcash India &ldquo;Build on Zcash&rdquo; bounty</span>
        <span>Powered by NEAR Intents · Zorro never holds your passkey</span>
      </footer>
    </section>
  );
}
