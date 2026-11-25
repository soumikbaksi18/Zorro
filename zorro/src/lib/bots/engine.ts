// The bot strategies, as pure functions: (settings, memory, price, time) → decision.
// No network, no database, no money. The worker (runner.ts) acts on the decision.

import type { BotConfig, BotState } from "./config";

export type Decision =
  | { type: "hold"; note?: string }
  | { type: "sell_zec"; amountZec: number; reason: string }
  | { type: "buy_zec"; amountUsd: number; reason: string };

const usd = (n: number) => `$${n.toFixed(2)}`;

export function evaluate(config: BotConfig, state: BotState, priceUsd: number, now: Date): { decision: Decision; state: BotState } {
  // A trade is already on its way, or the bot finished: nothing new until that settles.
  if (state.inFlight) return { decision: { type: "hold", note: "Waiting for the last trade to settle" }, state };
  if (state.completedAt) return { decision: { type: "hold", note: "Completed" }, state };

  const next: BotState = { ...state, lastPriceUsd: priceUsd };

  switch (config.kind) {
    case "stop_loss": {
      if (priceUsd <= config.triggerPriceUsd) {
        return {
          decision: {
            type: "sell_zec",
            amountZec: Number(config.amountZec),
            reason: `ZEC fell to ${usd(priceUsd)}, at or below your stop of ${usd(config.triggerPriceUsd)}`,
          },
          state: next,
        };
      }
      return { decision: { type: "hold" }, state: next };
    }

    case "trailing_stop": {
      const peak = Math.max(state.peakUsd ?? priceUsd, priceUsd);
      next.peakUsd = peak;
      const stopAt = peak * (1 - config.trailPct / 100);
      if (priceUsd <= stopAt) {
        return {
          decision: {
            type: "sell_zec",
            amountZec: Number(config.amountZec),
            reason: `ZEC fell to ${usd(priceUsd)}, ${config.trailPct}% below its peak of ${usd(peak)}`,
          },
          state: next,
        };
      }
      return { decision: { type: "hold" }, state: next };
    }

    case "smart_dca": {
      const buys = state.buys ?? 0;
      if (config.maxBuys !== null && buys >= config.maxBuys) {
        return { decision: { type: "hold", note: "Reached the maximum number of buys" }, state: { ...next, completedAt: now.toISOString() } };
      }
      if (state.nextRunAt && now < new Date(state.nextRunAt)) return { decision: { type: "hold" }, state: next };

      let amountUsd = config.buyUsd;
      let reason = `Scheduled buy #${buys + 1}`;
      const avg = (state.boughtZec ?? 0) > 0 ? (state.spentUsd ?? 0) / state.boughtZec! : null;
      if (avg !== null && config.dipBoostPct > 0 && priceUsd <= avg * (1 - config.dipThresholdPct / 100)) {
        amountUsd = Math.round(config.buyUsd * (1 + config.dipBoostPct / 100) * 100) / 100;
        reason += `, boosted ${config.dipBoostPct}%: ZEC at ${usd(priceUsd)} is below your average of ${usd(avg)}`;
      }
      return { decision: { type: "buy_zec", amountUsd, reason }, state: next };
    }
  }
}

/** When the next DCA buy is due after one runs now. */
export function nextDcaRun(everyHours: number, now: Date): string {
  return new Date(now.getTime() + everyHours * 3_600_000).toISOString();
}

/** How far the price is from the trigger, for the UI. Positive = room left before selling. */
export function distanceToTrigger(config: BotConfig, state: BotState, priceUsd: number): { triggerUsd: number; pct: number } | null {
  if (config.kind === "stop_loss") {
    return { triggerUsd: config.triggerPriceUsd, pct: ((priceUsd - config.triggerPriceUsd) / priceUsd) * 100 };
  }
  if (config.kind === "trailing_stop") {
    const peak = Math.max(state.peakUsd ?? priceUsd, priceUsd);
    const triggerUsd = peak * (1 - config.trailPct / 100);
    return { triggerUsd, pct: ((priceUsd - triggerUsd) / priceUsd) * 100 };
  }
  return null;
}
