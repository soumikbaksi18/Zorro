"use client";

import { Fingerprint, KeyRound } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { createPasskey, passkeyBlocker, signInWithPasskey } from "@/lib/account-client";

const noSubscribe = () => () => {};

/** Create a passkey (new user) or sign in with an existing one. */
export function PasskeyGate({ title = "Create your Zorro passkey" }: { title?: string }) {
  const blocker = useSyncExternalStore(noSubscribe, passkeyBlocker, () => null);
  const [busy, setBusy] = useState<"create" | "signin" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "create" | "signin") {
    setBusy(kind);
    setError(null);
    try {
      await (kind === "create" ? createPasskey() : signInWithPasskey());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Passkey failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel-hero p-5" aria-labelledby="gate-heading">
      <span className="grid h-10 w-10 place-items-center rounded-2xl bg-zec/15 text-zec">
        <Fingerprint size={20} strokeWidth={1.6} aria-hidden="true" />
      </span>
      <h2 id="gate-heading" className="mt-4 text-xl font-medium tracking-[-0.02em]">
        {title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Your passkey is your Zorro account: Face ID, fingerprint or your device PIN. No email, password or seed
        phrase. It also owns your wallet and approves every payee, so keep it on a device you trust.
      </p>

      {blocker ? (
        <p className="mt-4 rounded-2xl border border-gold/30 bg-gold/10 px-3 py-2.5 text-sm text-gold">{blocker}</p>
      ) : (
        <div className="mt-5 flex flex-col gap-2.5">
          <button type="button" onClick={() => run("create")} disabled={busy !== null} className="btn-primary w-full">
            <Fingerprint size={17} aria-hidden="true" />
            {busy === "create" ? "Waiting for your passkey…" : "Create passkey"}
          </button>
          <button type="button" onClick={() => run("signin")} disabled={busy !== null} className="btn-secondary w-full">
            <KeyRound size={16} aria-hidden="true" />
            {busy === "signin" ? "Waiting for your passkey…" : "I already have one: sign in"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-down">
          {error}
        </p>
      )}
    </section>
  );
}
