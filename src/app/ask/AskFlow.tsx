"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp, ExternalLink, Mic, Sparkles, Square, Volume2, VolumeX } from "lucide-react";
import { api } from "@/lib/api-client";
import { useAccount } from "@/lib/account-client";
import type { AssistantAction, AssistantReply } from "@/lib/assistant";
import { AssetChart } from "@/components/AssetChart";
import { CoinBadge, useFiat } from "@/components/money";
import { PageHeader } from "@/components/shell/PageHeader";
import { ErrorBox } from "@/components/ui";
import { PasskeyGate } from "@/components/wallet/PasskeyGate";

type Msg = { id: number; role: "user" | "assistant"; text: string; language?: string; actions?: AssistantAction[]; pending?: boolean; error?: boolean };

const SUGGESTIONS = [
  "What's ZEC's price today?",
  "Show me ZEC's chart for 30 days",
  "What's my balance?",
  "Swap 0.1 ZEC to USDC",
  "How do I pay someone in USDC?",
  "ZEC की ताज़ा खबरें क्या हैं?",
];
const MAX_RECORD_MS = 45_000;
let nextId = 1;

/** Ask Zorro: chat + voice (Sarvam) about ZEC, the app and your wallet. It drafts; you confirm. */
export function AskFlow() {
  const account = useAccount();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(true);
  const [rec, setRec] = useState<"idle" | "recording" | "transcribing">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timers = useRef<{ tick?: ReturnType<typeof setInterval>; stop?: ReturnType<typeof setTimeout> }>({});
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioCache = useRef(new Map<number, string>());
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view; release the mic and audio on leave.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking]);
  useEffect(() => {
    const cache = audioCache.current;
    const t = timers.current;
    return () => {
      recorder.current?.stream.getTracks().forEach((tr) => tr.stop());
      audio.current?.pause();
      clearInterval(t.tick);
      clearTimeout(t.stop);
      cache.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  if (account.status === "loading") return <div className="panel h-64 animate-pulse" />;
  if (account.status !== "ready" || !account.me.user) {
    return (
      <>
        <PageHeader title="Ask Zorro" back={{ href: "/", label: "Home" }} />
        <PasskeyGate title="Sign in to talk to Zorro" />
      </>
    );
  }

  async function speak(msg: Msg, auto = false) {
    audio.current?.pause();
    if (speakingId === msg.id) {
      setSpeakingId(null);
      return;
    }
    try {
      let url = audioCache.current.get(msg.id);
      if (!url) {
        const res = await fetch("/api/assistant/tts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: msg.text, language: msg.language }),
        });
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Voice unavailable");
        url = URL.createObjectURL(await res.blob());
        audioCache.current.set(msg.id, url);
      }
      const el = new Audio(url);
      audio.current = el;
      el.onended = () => setSpeakingId((s) => (s === msg.id ? null : s));
      setSpeakingId(msg.id);
      await el.play();
    } catch (e) {
      setSpeakingId(null);
      const message = e instanceof Error ? e.message : "Couldn't play the answer";
      if (auto) {
        // Don't repeat the same error after every answer: switch spoken replies off and say why once.
        setVoiceReplies(false);
        setError(`Spoken replies are off for now: ${message}`);
      } else setError(message);
    }
  }

  async function send(question: string, language: string | null = null) {
    const q = question.trim();
    if (!q || thinking) return;
    setError(null);
    setText("");
    const history = messages.filter((m) => !m.pending && !m.error).map((m) => ({ role: m.role, content: m.text }));
    const user: Msg = { id: nextId++, role: "user", text: q };
    setMessages((m) => [...m, user]);
    setThinking(true);
    try {
      const r = await api<AssistantReply>("/api/assistant/chat", { text: q, language, history });
      const reply: Msg = { id: nextId++, role: "assistant", text: r.reply, language: r.language, actions: r.actions };
      setMessages((m) => [...m, reply]);
      if (voiceReplies) void speak(reply, true);
    } catch (e) {
      setMessages((m) => [...m, { id: nextId++, role: "assistant", text: e instanceof Error ? e.message : "Something went wrong.", error: true }]);
    } finally {
      setThinking(false);
    }
  }

  async function startRecording() {
    setError(null);
    audio.current?.pause();
    setSpeakingId(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access was blocked. Allow it in your browser settings, or type instead.");
      return;
    }
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t));
    const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = async () => {
      stream.getTracks().forEach((tr) => tr.stop());
      clearInterval(timers.current.tick);
      clearTimeout(timers.current.stop);
      const blob = new Blob(chunks, { type: r.mimeType || "audio/webm" });
      if (blob.size < 1200) {
        setRec("idle");
        setError("That was too short. Tap the mic, speak, then tap again.");
        return;
      }
      setRec("transcribing");
      try {
        const form = new FormData();
        form.append("audio", blob, "voice");
        const res = await fetch("/api/assistant/stt", { method: "POST", body: form });
        const data = (await res.json().catch(() => ({}))) as { transcript?: string; language?: string | null; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Couldn't understand the recording");
        setRec("idle");
        if (!data.transcript) {
          setError("I didn't catch that. Try again a little closer to the mic.");
          return;
        }
        await send(data.transcript, data.language ?? null);
      } catch (e) {
        setRec("idle");
        setError(e instanceof Error ? e.message : "Voice failed");
      }
    };
    recorder.current = r;
    r.start();
    setRec("recording");
    setElapsed(0);
    const started = Date.now();
    timers.current.tick = setInterval(() => setElapsed(Date.now() - started), 250);
    timers.current.stop = setTimeout(() => r.state === "recording" && r.stop(), MAX_RECORD_MS);
  }

  function toggleMic() {
    if (rec === "recording") recorder.current?.stop();
    else if (rec === "idle") void startRecording();
  }

  const empty = messages.length === 0;
  const busy = thinking || rec === "transcribing";
  return (
    <div className="flex min-h-[calc(100dvh-140px)] flex-col">
      <PageHeader
        title="Ask Zorro"
        back={{ href: "/", label: "Home" }}
        action={
          <button
            type="button"
            onClick={() => {
              setVoiceReplies((v) => !v);
              audio.current?.pause();
              setSpeakingId(null);
            }}
            aria-pressed={voiceReplies}
            aria-label={voiceReplies ? "Spoken replies on" : "Spoken replies off"}
            title={voiceReplies ? "Spoken replies on" : "Spoken replies off"}
            className="icon-btn"
          >
            {voiceReplies ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
          </button>
        }
      />

      {empty ? (
        <section className="flex flex-1 flex-col items-center text-center">
          <button type="button" onClick={toggleMic} disabled={busy} aria-label="Start talking to Zorro" className="relative mt-4 grid h-36 w-36 place-items-center">
            <span className="anim-ring absolute inset-0 rounded-full bg-brand/25" />
            <span className="anim-ring absolute inset-0 rounded-full bg-brand/20" style={{ animationDelay: "1.1s" }} />
            <span className="anim-glow absolute inset-4 rounded-full bg-[radial-gradient(circle,rgba(184,243,107,0.45),transparent_70%)]" />
            <span className="relative grid h-24 w-24 place-items-center rounded-full bg-gradient-to-b from-brand-light to-brand text-brand-ink shadow-[0_18px_40px_-12px_rgba(184,243,107,0.7)]">
              <Mic size={36} strokeWidth={2} aria-hidden="true" />
            </span>
          </button>
          <h2 className="mt-6 text-[22px] font-semibold tracking-[-0.02em]">Tap and talk</h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-snow/65">
            Ask about ZEC, your wallet or how Zorro works, in English, हिन्दी, தமிழ், বাংলা or any Indian language.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => send(s)} className="chip">
                {s}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <ol className="flex flex-1 flex-col gap-4 pb-4" aria-live="polite">
          {messages.map((m) => (
            <li key={m.id} className={m.role === "user" ? "flex justify-end" : "flex flex-col items-start gap-2.5"}>
              {m.role === "user" ? (
                <p className="max-w-[85%] rounded-3xl rounded-br-lg bg-gradient-to-b from-brand-light to-brand px-4 py-2.5 text-[15px] leading-relaxed text-brand-ink">{m.text}</p>
              ) : (
                <>
                  <div className={`glass max-w-[92%] rounded-3xl rounded-bl-lg px-4 py-3 ${m.error ? "border-down/40" : ""}`}>
                    <p className={`text-[15px] leading-relaxed whitespace-pre-wrap ${m.error ? "text-down" : ""}`}>{m.text}</p>
                    {!m.error && (
                      <button type="button" onClick={() => speak(m)} className="mt-2 flex items-center gap-1.5 text-xs text-snow/55 hover:text-brand">
                        {speakingId === m.id ? <Square size={12} aria-hidden="true" /> : <Volume2 size={13} aria-hidden="true" />}
                        {speakingId === m.id ? "Stop" : "Listen"}
                      </button>
                    )}
                  </div>
                  {m.actions?.map((a, i) => (
                    <div key={i} className="w-full">
                      <ActionCard action={a} />
                    </div>
                  ))}
                </>
              )}
            </li>
          ))}
          {thinking && (
            <li className="flex items-center gap-2 text-sm text-snow/60">
              <span className="flex gap-1" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-brand" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </span>
              Zorro is thinking…
            </li>
          )}
          <div ref={endRef} />
        </ol>
      )}

      {error && <ErrorBox message={error} />}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
        className="sticky bottom-[calc(96px+env(safe-area-inset-bottom))] z-20 mt-4"
      >
        <div className="glass flex items-center gap-2 rounded-full p-1.5 pl-4 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.85)]">
          {rec === "recording" ? (
            <p className="flex flex-1 items-center gap-2 text-sm text-snow/85" role="status">
              <span className="relative flex h-2.5 w-2.5">
                <span className="anim-ring absolute inset-0 rounded-full bg-down" />
                <span className="relative h-2.5 w-2.5 rounded-full bg-down" />
              </span>
              Listening… {Math.floor(elapsed / 1000)}s
            </p>
          ) : rec === "transcribing" ? (
            <p className="flex-1 text-sm text-snow/70" role="status">
              Understanding what you said…
            </p>
          ) : (
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1000}
              placeholder="Ask about ZEC or your wallet…"
              aria-label="Message"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-snow/40 focus-visible:outline-none"
            />
          )}
          {text.trim() && rec === "idle" ? (
            <button type="submit" disabled={busy} aria-label="Send" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-brand-ink disabled:opacity-50">
              <ArrowUp size={19} strokeWidth={2.4} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleMic}
              disabled={busy && rec !== "recording"}
              aria-label={rec === "recording" ? "Stop and send" : "Talk"}
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-50 ${rec === "recording" ? "bg-down text-white" : "bg-brand text-brand-ink"}`}
            >
              {rec === "recording" ? <Square size={16} fill="currentColor" aria-hidden="true" /> : <Mic size={19} aria-hidden="true" />}
            </button>
          )}
        </div>
        <p className="mt-2 px-2 text-center text-[11px] leading-relaxed text-snow/40">
          <Sparkles size={11} className="mr-1 inline" aria-hidden="true" />
          Voice and answers by Sarvam AI. Zorro shares your question, balances, payee names and recent payments to answer, never addresses or keys. It only drafts: you confirm every action.
        </p>
      </form>
    </div>
  );
}

function ActionCard({ action: a }: { action: AssistantAction }) {
  const { fmt } = useFiat();
  if (a.type === "chart") return <AssetChart asset={a.asset} range={a.range} />;
  if (a.type === "balances") {
    return (
      <section className="panel p-4" aria-label="Your balances">
        <p className="flex items-baseline justify-between text-sm">
          <span className="font-semibold">Your balance</span>
          <span className="tabular font-semibold">{fmt(a.balances.totalUsd)}</span>
        </p>
        <ul className="mt-3 flex flex-col gap-2.5">
          {a.balances.coins.map((c) => (
            <li key={c.key} className="flex items-center gap-3 text-sm">
              <CoinBadge coinKey={c.key} size={28} />
              <span className="flex-1">
                {c.symbol} <span className="text-xs text-snow/50">{c.chainName}</span>
              </span>
              <span className="tabular text-right">
                <span className="block">{Number(c.amount).toLocaleString("en-US", { maximumFractionDigits: 6 })}</span>
                <span className="block text-xs text-snow/50">{fmt(c.usd)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  if (a.type === "draft") {
    return (
      <section className="glass-card p-4">
        <p className="text-xs font-semibold text-brand-ink/65 uppercase">{a.kind === "swap" ? "Swap draft" : a.kind === "autopay" ? "Autopay draft" : "Payment draft"}</p>
        <div className="mt-2 flex items-center gap-3">
          <CoinBadge coinKey={a.coinKey} size={36} />
          <div className="min-w-0">
            <p className="truncate text-[17px] font-semibold">{a.title}</p>
            <p className="truncate text-sm text-brand-ink/75">{a.detail}</p>
          </div>
        </div>
        <Link href={a.href} className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand-ink text-sm font-semibold text-brand">
          Review &amp; confirm <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>
    );
  }
  if (a.type === "open") {
    return (
      <Link href={a.href} className="btn-secondary min-h-11 w-full text-[13px]">
        {a.label} <ArrowRight size={15} aria-hidden="true" />
      </Link>
    );
  }
  return (
    <section className="panel p-4" aria-label="Latest Zcash news">
      <p className="text-sm font-semibold">Latest on Zcash</p>
      <ul className="mt-2 flex flex-col">
        {a.items.map((n) => (
          <li key={n.link} className="border-t border-line py-2.5 first:border-t-0">
            <a href={n.link} target="_blank" rel="noopener noreferrer" className="group flex gap-2 text-sm leading-snug hover:text-brand">
              <span className="flex-1">
                {n.title}
                <span className="mt-0.5 block text-xs text-snow/45">
                  {n.source} · {new Date(n.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </span>
              </span>
              <ExternalLink size={13} className="mt-1 shrink-0 text-snow/40 group-hover:text-brand" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
