// Live prices for the Markets tab, straight from the NEAR Intents token list
// (the same venue Zorro trades on).

import { cacheLife } from "next/cache";
import { getTokens } from "./oneclick";

const MARKETS = [
  { assetId: "nep141:zec.omft.near", symbol: "ZEC", name: "Zcash" },
  { assetId: "nep141:btc.omft.near", symbol: "BTC", name: "Bitcoin" },
  { assetId: "nep141:eth.omft.near", symbol: "ETH", name: "Ethereum" },
  { assetId: "nep141:sol.omft.near", symbol: "SOL", name: "Solana" },
  { assetId: "nep141:wrap.near", symbol: "NEAR", name: "NEAR" },
  { assetId: "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near", symbol: "USDC", name: "USD Coin" },
] as const;

export type MarketRow = { symbol: string; name: string; priceUsd: number; updatedAt: string };

export async function getMarkets(): Promise<MarketRow[]> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 30, expire: 300 });

  const tokens = await getTokens();
  return MARKETS.flatMap((m) => {
    const t = tokens.find((x) => x.assetId === m.assetId);
    return t ? [{ symbol: m.symbol, name: m.name, priceUsd: t.price, updatedAt: t.priceUpdatedAt }] : [];
  });
}
