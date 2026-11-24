# Zorro

Take-profit, stop-loss, limit orders and DCA for Zcash, on your phone. Powered by NEAR Intents. Zorro never holds your keys or funds.

Built for the Zcash India "Build on Zcash" bounty. See [PLAN.md](PLAN.md) for the full design.

## Status

**Phase 1 (skeleton): done**
- Installable phone web app (manifest + icons from `brand/zorro-logo.png`)
- Live ZEC price in INR/USD (NEAR Intents 1Click price, CoinGecko 24h change, Frankfurter USD→INR)
- Price chart (1D / 7D / 30D)
- Home, Trade, Orders and Settings screens; anonymous device ID

Next: Phase 0 checks (needs an API key and small real swaps), then Phase 2 "Swap now".

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
src/app/            screens (/, /trade, /orders, /settings) and API routes
src/app/api/price/  GET /api/price, GET /api/price/history?range=1d|7d|30d
src/components/     Market (price card + chart), PriceChart, BottomNav, InstallBanner
src/lib/oneclick.ts typed NEAR Intents 1Click client (server only)
src/lib/prices.ts   price sources, cached with "use cache"
src/lib/assets.ts   1Click asset IDs (ZEC, USDC on Base/Solana) and unit helpers
brand/              logo source
```
