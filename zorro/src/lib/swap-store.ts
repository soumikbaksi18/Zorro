"use client";

// Swaps and saved addresses, stored only in this browser (Zorro has no accounts).
// Phase 4 adds a server database for orders the worker must watch; plain swaps
// only need their deposit address, which is enough to fetch status from NEAR Intents.

import { useSyncExternalStore } from "react";
import type { SwapQuote, SwapStatusView } from "./swap";

export type SavedSwap = {
  id: string; // NEAR Intents deposit address
  createdAt: string;
  quote: SwapQuote;
  recipient: string;
  refundTo: string;
  status: SwapStatusView["status"];
  statusUpdatedAt?: string;
  receivedAmount?: string | null;
  refundedAmount?: string | null;
  refundReason?: string | null;
  destinationTx?: SwapStatusView["destinationTx"];
};

const SWAPS_KEY = "zorro.swaps";
const ADDRESSES_KEY = "zorro.addresses";
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}
const notify = () => listeners.forEach((l) => l());

// useSyncExternalStore needs a stable snapshot, so parse once per raw value.
let cachedRaw: string | null = null;
let cachedSwaps: SavedSwap[] = [];
function readSwaps(): SavedSwap[] {
  const raw = localStorage.getItem(SWAPS_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedSwaps = raw ? (JSON.parse(raw) as SavedSwap[]) : [];
    } catch {
      cachedSwaps = [];
    }
  }
  return cachedSwaps;
}
const EMPTY: SavedSwap[] = [];

function writeSwaps(swaps: SavedSwap[]) {
  localStorage.setItem(SWAPS_KEY, JSON.stringify(swaps));
  notify();
}

/** All swaps on this device, newest first. `null` until loaded in the browser. */
export function useSwaps(): SavedSwap[] | null {
  const swaps = useSyncExternalStore(subscribe, readSwaps, () => EMPTY);
  const loaded = useSyncExternalStore(subscribe, () => true, () => false);
  return loaded ? swaps : null;
}

export function saveSwap(swap: SavedSwap) {
  writeSwaps([swap, ...readSwaps().filter((s) => s.id !== swap.id)]);
}

export function updateSwap(id: string, patch: Partial<SavedSwap>) {
  const swaps = readSwaps();
  if (!swaps.some((s) => s.id === id)) return;
  writeSwaps(swaps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
}

export function deleteAllSwaps() {
  localStorage.removeItem(SWAPS_KEY);
  notify();
}

// ---------- Remembered addresses (per chain, for prefilling forms) ----------

export type SavedAddresses = Partial<Record<"zec" | "base" | "sol", string>>;

let cachedAddrRaw: string | null = null;
let cachedAddrs: SavedAddresses = {};
function readSavedAddresses(): SavedAddresses {
  const raw = localStorage.getItem(ADDRESSES_KEY);
  if (raw !== cachedAddrRaw) {
    cachedAddrRaw = raw;
    try {
      cachedAddrs = raw ? (JSON.parse(raw) as SavedAddresses) : {};
    } catch {
      cachedAddrs = {};
    }
  }
  return cachedAddrs;
}
const NO_ADDRESSES: SavedAddresses = {};

export function useSavedAddresses(): SavedAddresses {
  return useSyncExternalStore(subscribe, readSavedAddresses, () => NO_ADDRESSES);
}

export function rememberAddress(chain: "zec" | "base" | "sol", address: string) {
  localStorage.setItem(ADDRESSES_KEY, JSON.stringify({ ...readSavedAddresses(), [chain]: address.trim() }));
  notify();
}
