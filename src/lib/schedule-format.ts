// Display helpers for Autopay (safe for the browser).

import { coin, displayAmount } from "./coins";

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

export function describeSchedule(s: { frequency: "weekly" | "monthly"; day: number }) {
  return s.frequency === "weekly" ? `Every ${WEEKDAYS[s.day]}` : `Monthly on the ${ordinal(s.day)}`;
}

export function amountLabel(amount: string, currency: "COIN" | "USD" | "INR", coinKey: string) {
  // "INR" only appears on Autopays saved by older versions; new ones are USD or the coin.
  return currency === "INR"
    ? `${Number(amount).toLocaleString("en-US")} INR`
    : currency === "USD"
      ? `$${Number(amount).toLocaleString("en-US")}`
      : `${displayAmount(amount)} ${coin(coinKey).symbol}`;
}
