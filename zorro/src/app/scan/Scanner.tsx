"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Camera, ClipboardPaste, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api-client";
import { useAccount } from "@/lib/account-client";
import { shortAddress } from "@/lib/addresses";
import { canonicalAddress, coin, displayAmount } from "@/lib/coins";
import type { PayeeView } from "@/lib/payees";
import { parsePaymentCode, type ScanResult } from "@/lib/scan";
import { CoinPicker } from "@/components/CoinPicker";
import { coinName } from "@/components/money";
import { ErrorBox } from "@/components/ui";
import { PasskeyGate } from "@/components/wallet/PasskeyGate";

export function Scanner() {
  const account = useAccount();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [camera, setCamera] = useState<"off" | "starting" | "on" | "denied">("off");
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => stop, []);

  async function startCamera() {
    setError(null);
    setCamera("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setCamera("on");
      const { default: jsQR } = await import("jsqr");
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const tick = () => {
        if (!streamRef.current) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          const w = Math.min(640, video.videoWidth);
          const h = Math.round((video.videoHeight / video.videoWidth) * w);
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
          if (code?.data) {
            const parsed = parsePaymentCode(code.data);
            if (parsed) {
              stop();
              setCamera("off");
              setResult(parsed);
              navigator.vibrate?.(40);
              return;
            }
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch {
      stop();
      setCamera("denied");
    }
  }

  function readPasted(text: string) {
    const parsed = parsePaymentCode(text);
    if (parsed) {
      setResult(parsed);
      setError(null);
    } else setError("That isn't an address or payment link Zorro can pay.");
  }

  if (account.status === "loading") return <div className="panel h-64 animate-pulse" />;
  if (account.status !== "ready" || !account.me.user) return <PasskeyGate title="Sign in to pay" />;
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

  if (result) return <ScanOutcome result={result} onReset={() => setResult(null)} />;

  return (
    <div className="flex flex-col gap-5">
      <section className="relative overflow-hidden rounded-[26px] border border-line bg-black">
        <video ref={videoRef} playsInline muted className={`aspect-square w-full object-cover ${camera === "on" ? "" : "invisible"}`} />
        {camera === "on" && (
          <div className="pointer-events-none absolute inset-10 rounded-3xl border-2 border-zec/80 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" aria-hidden="true" />
        )}
        {camera !== "on" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-zec/15 text-zec">
              <Camera size={26} aria-hidden="true" />
            </span>
            <p className="text-sm text-snow/80">{camera === "denied" ? "Camera unavailable. Allow camera access, or paste below." : "Scan a payment QR code"}</p>
            {camera !== "denied" && (
              <button type="button" onClick={startCamera} disabled={camera === "starting"} className="btn-primary">
                {camera === "starting" ? "Starting camera…" : "Open camera"}
              </button>
            )}
          </div>
        )}
      </section>

      <div className="flex flex-col gap-2">
        <label htmlFor="paste" className="text-sm font-medium">
          Or paste
        </label>
        <div className="flex gap-2">
          <input
            id="paste"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="Address, zcash:, ethereum:, solana: or bitcoin: link"
            autoCapitalize="none"
            spellCheck={false}
            className="field min-w-0 font-mono text-sm"
          />
          <button
            type="button"
            onClick={async () => {
              const text = pasted || (await navigator.clipboard?.readText().catch(() => "")) || "";
              setPasted(text);
              readPasted(text);
            }}
            className="btn-secondary shrink-0 px-4"
            aria-label="Read pasted code"
          >
            <ClipboardPaste size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
      {error && <ErrorBox message={error} />}
    </div>
  );
}

function ScanOutcome({ result, onReset }: { result: ScanResult; onReset: () => void }) {
  const [coinKey, setCoinKey] = useState<string | null>(result.coinKey);
  const [payees, setPayees] = useState<PayeeView[] | null>(null);
  useEffect(() => {
    api<PayeeView[]>("/api/payees")
      .then(setPayees)
      .catch(() => setPayees([]));
  }, []);

  const c = coinKey ? coin(coinKey) : null;
  const canonical = c ? canonicalAddress(c.kind, result.address) : result.address;
  const match = c ? payees?.find((p) => p.coinKey === c.key && p.address === canonical) : undefined;
  const payParams = new URLSearchParams({ ...(result.amount ? { amount: result.amount, currency: "COIN" } : {}) });

  return (
    <div className="flex flex-col gap-5">
      <section className="glass-card p-5">
        <p className="text-sm font-medium text-zec-ink/70">{result.label ?? "Pay to"}</p>
        <p className="mt-1 font-mono text-[15px] font-semibold break-all">{shortAddress(result.address, 10)}</p>
        {result.amount && c && (
          <p className="tabular mt-3 text-[34px] leading-none font-semibold tracking-[-0.03em]">
            {displayAmount(result.amount)} {c.symbol}
          </p>
        )}
        {c && <p className="mt-2 text-sm text-zec-ink/75">in {coinName(c)}</p>}
      </section>

      {!result.coinKey && (
        <div>
          <p className="mb-2 text-sm font-medium">Which coin does this address take?</p>
          <CoinPicker value={coinKey} onChange={setCoinKey} label="Coin" only={result.candidates} />
        </div>
      )}

      {c &&
        (payees === null ? (
          <div className="panel h-16 animate-pulse" />
        ) : match?.status === "approved" ? (
          <Link href={`/pay?to=${match.id}&${payParams}`} className="btn-primary w-full">
            Pay {match.name}
          </Link>
        ) : match ? (
          <Link href="/payees" className="btn-primary w-full">
            <ShieldCheck size={17} aria-hidden="true" /> Approve {match.name} first
          </Link>
        ) : (
          <>
            <Link href={`/payees?${new URLSearchParams({ coin: c.key, address: result.address, name: result.label ?? "" })}`} className="btn-primary w-full">
              <ShieldCheck size={17} aria-hidden="true" /> Add &amp; approve this payee
            </Link>
            <p className="text-xs leading-relaxed text-muted">New addresses need your Face ID once. After that you can pay them any time, including with Autopay.</p>
          </>
        ))}
      <button type="button" onClick={onReset} className="btn-secondary w-full">
        Scan again
      </button>
    </div>
  );
}
