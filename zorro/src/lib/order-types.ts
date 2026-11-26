// The bots Zorro offers (PLAN.md §3) and how each one executes.

import type { LucideIcon } from "lucide-react";
import { ChartNoAxesCombined, Grid3x3, Repeat, ShieldAlert } from "lucide-react";

export type BotType = {
  key: "smart-dca" | "stop-loss" | "tp-ladder" | "grid";
  title: string;
  example: string;
  how: string;
  icon: LucideIcon;
  phase: number; // build phase in PLAN.md §8
  /** Bot kinds this card can create today (anchor on /bots/new). */
  create?: "stop_loss" | "smart_dca" | "tp_ladder" | "grid";
};

export const BOT_TYPES: BotType[] = [
  {
    key: "stop-loss",
    title: "Stop-loss & trailing stop",
    example: "Sell 2 ZEC if price falls 10% from its peak",
    how: "Zorro watches the price 24/7 and sells through NEAR Intents the moment your rule triggers.",
    icon: ShieldAlert,
    phase: 6,
    create: "stop_loss",
  },
  {
    key: "smart-dca",
    title: "Smart DCA",
    example: "Buy ₹2,000 of ZEC every Friday, more on dips",
    how: "Buys on schedule from your bot wallet, and a little more when price is below its average.",
    icon: Repeat,
    phase: 6,
    create: "smart_dca",
  },
  {
    key: "tp-ladder",
    title: "Take-profit ladder",
    example: "Sell 25% at $800, 25% at $900, …",
    how: "Places resting NEAR Intents limit orders that fill on their own as the price climbs.",
    icon: ChartNoAxesCombined,
    phase: 7,
    create: "tp_ladder",
  },
  {
    key: "grid",
    title: "Grid",
    example: "Buy low, sell high between $600 and $900",
    how: "A ladder of buy and sell orders that re-arms after every fill, so you profit from price swings.",
    icon: Grid3x3,
    phase: 7,
    create: "grid",
  },
];
