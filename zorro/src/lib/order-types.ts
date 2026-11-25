// The order types Zorro offers, and how each one executes (see PLAN.md §4.2).

export type OrderTypeKey = "swap" | "take-profit" | "stop-loss" | "limit-buy" | "dca" | "alert";

export type OrderType = {
  key: OrderTypeKey;
  title: string;
  example: string;
  execution: "auto" | "one-tap";
  how: string;
  phase: number; // build phase in PLAN.md §11
  /** Set once the feature is built. */
  href?: string;
};

export const ORDER_TYPES: OrderType[] = [
  {
    key: "swap",
    title: "Swap now",
    example: "Sell 1 ZEC for USDC right now",
    execution: "one-tap",
    how: "Get a live NEAR Intents quote, then confirm the payment in your own wallet.",
    phase: 2,
    href: "/swap",
  },
  {
    key: "take-profit",
    title: "Take-profit",
    example: "Sell 2 ZEC if price ≥ $900",
    execution: "auto",
    how: "A native NEAR Intents limit order. Deposit once and it fills on its own when the price is hit.",
    phase: 3,
  },
  {
    key: "stop-loss",
    title: "Stop-loss",
    example: "Sell 2 ZEC if price ≤ $600",
    execution: "one-tap",
    how: "Zorro watches the price. When it triggers, you get a notification. Tap it to confirm the sale in your wallet.",
    phase: 4,
  },
  {
    key: "limit-buy",
    title: "Limit buy",
    example: "Buy ZEC with 100 USDC if price ≤ $650",
    execution: "auto",
    how: "A native NEAR Intents limit order funded with USDC. It fills on its own when the price is hit.",
    phase: 3,
  },
  {
    key: "dca",
    title: "DCA",
    example: "Buy ₹2,000 of ZEC every Friday",
    execution: "one-tap",
    how: "On schedule, Zorro prepares a quote and notifies you. One tap to approve. ZEC lands in your shielded address.",
    phase: 5,
  },
  {
    key: "alert",
    title: "Price alert",
    example: "Notify me at $800",
    execution: "auto",
    how: "Zorro watches the price and sends a notification. No funds involved.",
    phase: 4,
  },
];
