"use client";

// Small localStorage-backed preferences shared across screens.

import { useSyncExternalStore } from "react";

export type Currency = "INR" | "USD";

const CURRENCY_KEY = "zorro.currency";
const DEVICE_KEY = "zorro.deviceId";
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function readCurrency(): Currency {
  return localStorage.getItem(CURRENCY_KEY) === "USD" ? "USD" : "INR";
}

/** Display currency (INR or USD). Defaults to INR. */
export function useCurrency(): [Currency, (next: Currency) => void] {
  const currency = useSyncExternalStore(subscribe, readCurrency, () => "INR" as Currency);
  const setCurrency = (next: Currency) => {
    localStorage.setItem(CURRENCY_KEY, next);
    listeners.forEach((l) => l());
  };
  return [currency, setCurrency];
}

/**
 * Anonymous device ID. Zorro has no accounts: orders and push subscriptions
 * will be tied to this random ID, stored only in this browser.
 */
export function useDeviceId(): string | null {
  return useSyncExternalStore(subscribe, readOrCreateDeviceId, () => null);
}

function readOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    // Created once on first read; every later read returns the same stored value.
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

const HIDE_KEY = "zorro.hideBalance";
const readHidden = () => localStorage.getItem(HIDE_KEY) === "1";

/** Hide balances on screen (for using the app in public). */
export function useHideBalance(): [boolean, () => void] {
  const hidden = useSyncExternalStore(subscribe, readHidden, () => false);
  const toggle = () => {
    localStorage.setItem(HIDE_KEY, hidden ? "0" : "1");
    listeners.forEach((l) => l());
  };
  return [hidden, toggle];
}
