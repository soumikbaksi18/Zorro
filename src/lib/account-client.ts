"use client";

// Browser side of the account: who is signed in, their bot wallet, and passkey actions.

import { useSyncExternalStore } from "react";
import { browserSupportsWebAuthn, startAuthentication, startRegistration, WebAuthnError } from "@simplewebauthn/browser";
import type { AgentSummary } from "./agent-service";

export type Me = {
  user: { id: string; origin: string; handle: string | null; createdAt: string } | null;
  agent: AgentSummary | null;
};

type State = { status: "loading" } | { status: "ready"; me: Me } | { status: "error" };

let state: State = { status: "loading" };
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

/** Re-read /api/me (after sign-in, sign-out, or creating a wallet). */
export function refreshAccount(): Promise<void> {
  inFlight ??= fetch("/api/me", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((me: Me) => set({ status: "ready", me }))
    .catch(() => set({ status: "error" }))
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1 && state.status === "loading") void refreshAccount();
  return () => listeners.delete(listener);
}

const SERVER_STATE: State = { status: "loading" };

export function useAccount(): State {
  return useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}

// ---------- Passkeys ----------

export class PasskeyError extends Error {}

/** Why passkeys can't work here, or null if they can. */
export function passkeyBlocker(): string | null {
  if (typeof window === "undefined") return null;
  if (!window.isSecureContext) return "Passkeys need a secure connection. Open Zorro over HTTPS or on localhost.";
  if (!browserSupportsWebAuthn()) return "This browser doesn't support passkeys.";
  return null;
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new PasskeyError(data.error ?? "Something went wrong");
  return data as T;
}

function explain(e: unknown): PasskeyError {
  if (e instanceof PasskeyError) return e;
  if (e instanceof WebAuthnError && e.code === "ERROR_CEREMONY_ABORTED") return new PasskeyError("Cancelled.");
  if (e instanceof Error && e.name === "NotAllowedError") {
    return new PasskeyError(
      "Face ID was cancelled or didn't open. Tap the button again. On iPhone, passkeys also need iCloud Keychain (Settings → your name → iCloud → Passwords).",
    );
  }
  return new PasskeyError(e instanceof Error ? e.message : "Passkey failed");
}

// Safari (iPhone, iPad, Mac) only opens Face ID / Touch ID when it's asked right after a tap.
// Waiting for the server first can make it cancel silently, so the options are fetched ahead
// of time and the tap goes straight to the passkey prompt.

type RegisterOptions = Parameters<typeof startRegistration>[0]["optionsJSON"];
type LoginOptions = Parameters<typeof startAuthentication>[0]["optionsJSON"];
type Warm<T> = { options: T; at: number };

const OPTIONS_FRESH_MS = 4 * 60_000; // server challenges last 5 minutes
let warmRegister: Warm<RegisterOptions> | null = null;
let warmLogin: Warm<LoginOptions> | null = null;
let warming: Promise<void> | null = null;

const fresh = <T>(w: Warm<T> | null) => (w && Date.now() - w.at < OPTIONS_FRESH_MS ? w.options : null);

/** Fetch sign-up and sign-in options before the user taps (call on screens with passkey buttons). */
export function warmPasskeys(): Promise<void> {
  warming ??= Promise.all([
    fresh(warmRegister)
      ? null
      : post<RegisterOptions>("/api/auth/register/options").then((options) => {
          warmRegister = { options, at: Date.now() };
        }),
    fresh(warmLogin)
      ? null
      : post<LoginOptions>("/api/auth/login/options").then((options) => {
          warmLogin = { options, at: Date.now() };
        }),
  ])
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      warming = null;
    });
  return warming;
}

/** Must be called straight from a tap handler: no await happens before the passkey prompt opens. */
export async function createPasskey(): Promise<void> {
  const ready = fresh(warmRegister);
  warmRegister = null; // each challenge is single-use
  try {
    const response = await (ready
      ? startRegistration({ optionsJSON: ready })
      : post<RegisterOptions>("/api/auth/register/options").then((optionsJSON) => startRegistration({ optionsJSON })));
    await post("/api/auth/register/verify", response);
  } catch (e) {
    void warmPasskeys(); // ready for the next tap
    throw explain(e);
  } finally {
    await refreshAccount();
  }
}

/** Must be called straight from a tap handler: no await happens before the passkey prompt opens. */
export async function signInWithPasskey(): Promise<void> {
  const ready = fresh(warmLogin);
  warmLogin = null;
  try {
    const response = await (ready
      ? startAuthentication({ optionsJSON: ready })
      : post<LoginOptions>("/api/auth/login/options").then((optionsJSON) => startAuthentication({ optionsJSON })));
    await post("/api/auth/login/verify", response);
  } catch (e) {
    void warmPasskeys(); // ready for the next tap
    throw explain(e);
  } finally {
    await refreshAccount();
  }
}

export async function signOut(): Promise<void> {
  await post("/api/auth/logout").catch(() => undefined);
  await refreshAccount();
}

// ---------- Wallet ----------

export type PolicyChoices = {
  dailyLimitUsd: string;
  cashOutZec?: string;
};

type Prepared = { correlationId: string; agentId: string; webauthnOptions: Record<string, unknown>; summary: string; expiresAt: string };
type CreateResult = { status: "ACTIVE"; agentId: string } | { status: "PROCESSING"; correlationId: string } | { status: "FAILED"; reason: string };

export function prepareWallet(choices: PolicyChoices): Promise<Prepared> {
  return post<Prepared>("/api/agent/prepare", choices);
}

/** Ask the passkey to sign an owner intent prepared by the server. */
async function signIntent(webauthnOptions: Record<string, unknown>) {
  try {
    return await startAuthentication({
      optionsJSON: webauthnOptions as unknown as Parameters<typeof startAuthentication>[0]["optionsJSON"],
    });
  } catch (e) {
    throw explain(e);
  }
}

/** Sign the prepared intent with the passkey, submit it, and wait for the wallet. */
export async function signAndCreateWallet(prepared: Prepared, onProgress: (step: string) => void): Promise<CreateResult> {
  onProgress("Waiting for your passkey…");
  const credential = await signIntent(prepared.webauthnOptions);
  onProgress("Creating your Zorro wallet on NEAR Intents…");
  let result = await post<CreateResult>("/api/agent/submit", { correlationId: prepared.correlationId, credential });
  // Settlement can take a little while; keep checking without re-signing.
  for (let i = 0; i < 4 && result.status === "PROCESSING"; i++) {
    onProgress("Still confirming on NEAR…");
    result = await post<CreateResult>("/api/agent/submit", { correlationId: prepared.correlationId });
  }
  await refreshAccount();
  return result;
}

type ApprovalResult = { status: "APPROVED"; count: number } | { status: "PROCESSING"; correlationId: string } | { status: "FAILED"; reason: string };

export type PreparedApproval = { correlationId: string; webauthnOptions: Record<string, unknown>; count: number };

/** Step 1 (own tap): build the rules change that approves every waiting payee. */
export function preparePayeeApproval(): Promise<PreparedApproval> {
  return post<PreparedApproval>("/api/payees/approve", { step: "prepare" });
}

/** Step 2 (call straight from the Face ID tap): sign it with the passkey and save it on NEAR Intents. */
export async function signPayeeApproval(prepared: PreparedApproval, onProgress: (step: string) => void): Promise<ApprovalResult> {
  onProgress("Confirm with Face ID or your fingerprint…");
  const credential = await signIntent(prepared.webauthnOptions);
  onProgress("Saving your approved payees on NEAR Intents…");
  let result = await post<ApprovalResult>("/api/payees/approve", { step: "submit", correlationId: prepared.correlationId, credential });
  for (let i = 0; i < 4 && result.status === "PROCESSING"; i++) {
    onProgress("Still confirming…");
    result = await post<ApprovalResult>("/api/payees/approve", { step: "submit", correlationId: prepared.correlationId });
  }
  return result;
}

export function checkPaymentPermission(): Promise<{ ok: boolean; detail: string }> {
  return post("/api/agent/grant-check");
}
