# Zorro

Private, automatic trading bots for ZEC, on your phone. Powered by NEAR Intents. Your funds stay in your own agent wallet, and bots can only trade within limits you sign.

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

**Phase 3 (foundations): done**
- Database (libsql/SQLite via Drizzle): users, agents, grants, bots, bot events, operations
- AES-256-GCM encryption for grant tokens, bound to their agent
- Typed NEAR Intents Agent API client (agents, owner intents, deposits, swaps, limit orders, withdrawals)
- AI client with JSON validation and a guard that blocks addresses, keys and tokens from prompts
- System status in Settings (`GET /api/health`) and unit tests

**What we learned from the NEAR Intents APIs (2026-11-25)**
- 1Click quotes and status work without a key; with our key, quotes carry the documented fee (~0.20%)
- Shielded `u1…` addresses pass 1Click validation, but the docs list ZEC as transparent-only: real delivery still to be tested
- Minimum ZEC swap: 0.00132 ZEC. Buying ZEC has a fixed ~0.00032 ZEC withdrawal fee
- Agent API: experimental mainnet beta; passkey and NEAR owners; native ZEC supported

Next: Phase 4, passkey sign-up and the user's agent wallet.

## Run locally

Requires Node 22+.

```bash
cp .env.example .env.local   # fill in the keys (see comments in the file)
npm install
npm run db:migrate           # creates data/zorro.db
npm run dev                  # http://localhost:3000
```

Set `ZORRO_ENCRYPTION_KEY` to 32 random bytes, e.g. `openssl rand -base64 32`.

To try it on your phone, run `npm run dev -- -H 0.0.0.0` and open `http://<your-computer's-LAN-IP>:3000` on a phone on the same Wi-Fi.

Other commands: `npm test` (unit tests), `npm run typecheck`, `npm run lint`, `npm run db:generate` (new migration after editing `src/db/schema.ts`).

## Project layout

```
src/app/              screens (/, /trade, /swap, /swap/[id], /orders, /settings) and API routes
src/app/api/price/    GET /api/price, GET /api/price/history?range=1d|7d|30d
src/app/api/swap/     POST /api/swap/quote, GET /api/swap/status?depositAddress=
src/app/api/health/   GET /api/health (system status)
src/db/               database schema and connection
src/lib/agent-api.ts  typed NEAR Intents Agent API client (server only)
src/lib/oneclick.ts   typed NEAR Intents 1Click client (server only)
src/lib/ai.ts         AI client with output validation and data guard (server only)
src/lib/crypto.ts     grant-token encryption, hashing, idempotency keys
src/lib/swap.ts       swap request → NEAR Intents quote, friendly errors, status
src/lib/payment-links.ts  ZIP-321 / EIP-681 / Solana Pay links
src/components/       Market (price card + chart), PriceChart, BottomNav, InstallBanner
drizzle/              database migrations
brand/                logo source
```
