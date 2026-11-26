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

**Phase 4 (bot wallet): done**
- Passkey sign-up and sign-in (WebAuthn, ES256, user verification), verified server-side; session cookie holds a random token, only its hash is stored
- Limits screen: daily USD budget and the only addresses money may leave to, shown in plain words
- One passkey signature creates the NEAR Intents agent *and* authorizes Zorro's grant; NEAR's own summary is shown before signing
- Grant token encrypted at rest (bound to its agent), only its SHA-256 sent to NEAR; "Test permission" proves it with a dry-run quote
- Verified end to end on mainnet with a virtual passkey: agent ACTIVE in ~15 s, grant accepted

**Phase 5 (fund & withdraw): built, real-funds test pending**
- One-time NEAR Intents deposit addresses for ZEC, USDC on Base and USDC on Solana, with QR and "Open in wallet" links and live status
- Live balances (valued at NEAR Intents prices) and today's budget usage
- Withdrawals only to the addresses in the signed limits, with a fee preview first
- Every money action is stored with its Idempotency-Key before sending, so retries never double-send

**Phase 6 (bot engine): built, real live-trade test pending**
- Strategies as pure, unit-tested functions: stop-loss, trailing stop, Smart DCA (with dip boost)
- Paper mode: real NEAR Intents quotes, no money moved. Live mode: trades within the signed policy
- Worker (`npm run worker`): checks quote warnings before any live trade and pauses instead of sending a doomed one; one trade per wallet at a time; uncertain trades are polled, never resent under a new key
- Bot pages with live trigger distance, DCA stats, pause/resume/stop and an activity log
- Demo mode (`ZORRO_DEMO_MODE=1`, development only): set a fake price in Settings to show a bot triggering

**Phase 7 (limit-order bots): built, real live-order test pending**
- Take-profit ladder: sell in up to 6 rungs at rising prices, each a resting NEAR Intents limit order
- Grid: buys below and sells above the price across 3–10 levels; every fill places the opposite order one level away and books the round-trip profit
- Every order is previewed first; prices stay within the policy's 1% bound (using the real market price); orders expiring after NEAR Intents' 7-day maximum are re-placed
- Stopping a ladder or grid cancels its resting orders (unfilled amounts return to the wallet)

**Phase 8 (backtest + AI assistant): done**
- Backtest any bot on real hourly ZEC prices (7, 30 or 90 days): chart with buy/sell markers, fees included, compared with just holding. On the new-bot form and in the assistant
- AI assistant (`/assistant`): describe a strategy in plain English and get a validated bot (always drafted as paper), with the assumptions it made, an automatic 30-day backtest and Start paper / Start live buttons
- Asks a question when it can't know something (e.g. "half my ZEC"), and refuses what bots can't do (leverage, shorting, other coins)
- "Explain this with AI" turns any backtest into three plain sentences
- Privacy: only the typed text, today's price and bot settings go to the AI service; addresses, balances, keys and tokens are blocked before sending. Rate-limited per user
- Price history falls back from CoinGecko to Kraken when CoinGecko rate-limits

**Zcash news (`/news`, 4th tab)**
- Only stories about Zcash/ZEC (NewsAPI.org, or NewsData.io; filtered again on our side), newest first, refreshed every 30 minutes to stay inside free-plan limits
- Search, topic filters (Markets, Privacy & tech, Ecosystem), saved stories on this phone, share, load older stories
- "Zcash today in 30 seconds": an AI summary of the headlines with the overall mood (headlines only go to the AI service)
- Needs a news key in `.env.local` (`NEWS_API_KEY`, `NEWS_DATA_API_KEY` or `NEWSDATA_API_KEY` all work)

Next: Phase 9 (polish, demo mode for judges, deployment, video, X post), plus one small real deposit, live trade, live order and withdrawal.

## Run locally

Requires Node 22+.

```bash
cp .env.example .env.local   # fill in the keys (see comments in the file)
npm install
npm run db:migrate           # creates ~/.zorro/zorro.db (outside the project, see src/db/url.ts)
npm run dev                  # http://localhost:3000
npm run worker               # in a second terminal: runs the bots
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
