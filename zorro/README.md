# Zorro

Take-profit, stop-loss, limit orders and DCA for Zcash, on your phone. Powered by NEAR Intents. Zorro never holds your keys or funds.

Built for the Zcash India "Build on Zcash" bounty. See [PLAN.md](PLAN.md) for the full design.

## Status

**Phase 1 (skeleton): done**
- Installable phone web app (manifest + icons from `brand/zorro-logo.png`)
- Live ZEC price in INR/USD (NEAR Intents 1Click price, CoinGecko 24h change, Frankfurter USD→INR)
- Price chart (1D / 7D / 30D)
- Home, Trade, Orders and Settings screens; anonymous device ID

**Phase 2 (Swap now): built, not yet tested with real funds**
- Sell ZEC → USDC or buy ZEC with USDC, on Base or Solana
- Price-check quote to review, then a real NEAR Intents deposit address
- Pay by QR code or "Open in wallet": ZIP-321 (Zodl), EIP-681 (MetaMask), Solana Pay (Phantom)
- Live swap tracker (deposit → swapping → done or refunded) and an Orders list
- Swaps and last-used addresses stored only on the phone; one-tap delete in Settings

**What we learned from the NEAR Intents API (2026-11-25)**
- Quotes and status work **without an API key**
- Shielded unified addresses (`u1…`) are accepted as ZEC recipient and refund address
- Minimum ZEC swap: 0.00132 ZEC. Buying ZEC has a fixed ~0.00032 ZEC withdrawal fee, so very small buys are expensive
- The ZEC deposit address is transparent (`t1…`). Deposit window is ~3 days; the minimum-output guarantee protects the price

Next: one small real swap each way (Phase 0), then Phase 3 take-profit and limit orders.

## Run locally

Requires Node 22+.

```bash
cp .env.example .env.local   # add ONECLICK_API_KEY when you have one
npm install
npm run dev                  # http://localhost:3000
```

To try it on your phone, run `npm run dev -- -H 0.0.0.0` and open `http://<your-computer's-LAN-IP>:3000` on a phone on the same Wi-Fi.

## Project layout

```
src/app/            screens (/, /trade, /swap, /swap/[id], /orders, /settings) and API routes
src/app/api/price/  GET /api/price, GET /api/price/history?range=1d|7d|30d
src/app/api/swap/   POST /api/swap/quote, GET /api/swap/status?depositAddress=
src/lib/swap.ts     swap request → NEAR Intents quote, friendly errors, status
src/lib/payment-links.ts  ZIP-321 / EIP-681 / Solana Pay links
src/components/     Market (price card + chart), PriceChart, BottomNav, InstallBanner
src/lib/oneclick.ts typed NEAR Intents 1Click client (server only)
src/lib/prices.ts   price sources, cached with "use cache"
src/lib/assets.ts   1Click asset IDs (ZEC, USDC on Base/Solana) and unit helpers
brand/              logo source
```
