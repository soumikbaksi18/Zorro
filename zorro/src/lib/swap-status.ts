import type { SwapStatusView } from "./swap";

type Status = SwapStatusView["status"];

export const TERMINAL_STATUSES: Status[] = ["SUCCESS", "REFUNDED", "FAILED"];

export const STATUS_LABEL: Record<Status, string> = {
  PENDING_DEPOSIT: "Waiting for your deposit",
  KNOWN_DEPOSIT_TX: "Deposit seen, confirming",
  INCOMPLETE_DEPOSIT: "Deposit too small",
  PROCESSING: "Swapping",
  SUCCESS: "Done",
  REFUNDED: "Refunded",
  FAILED: "Failed",
};

export const STATUS_TONE: Record<Status, "wait" | "busy" | "good" | "bad"> = {
  PENDING_DEPOSIT: "wait",
  KNOWN_DEPOSIT_TX: "busy",
  INCOMPLETE_DEPOSIT: "bad",
  PROCESSING: "busy",
  SUCCESS: "good",
  REFUNDED: "bad",
  FAILED: "bad",
};

export const TONE_CLASSES = {
  wait: "bg-gold/15 text-gold",
  busy: "bg-zec/20 text-zec-light",
  good: "bg-up/15 text-up",
  bad: "bg-down/15 text-down",
} as const;

/** 0 = deposit, 1 = swapping, 2 = finished */
export function statusStep(status: Status): number {
  if (status === "PENDING_DEPOSIT" || status === "INCOMPLETE_DEPOSIT") return 0;
  if (status === "KNOWN_DEPOSIT_TX" || status === "PROCESSING") return 1;
  return 2;
}
