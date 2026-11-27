# Zorro

**Private cash for Zcash.** Hold ZEC and pay anyone, or spend at any app, in the coin they want (USDC, USDT, SOL, ETH, BTC, NEAR…). Zorro converts at the moment you pay through NEAR Intents, runs your regular payments with Autopay, and tracks every conversion. Every payee is approved once with your Face ID, and Zorro can't pay anyone else.

Built for the Zcash India "Build on Zcash" bounty. See [PLAN.md](PLAN.md) for the design. Version 1 (ZEC trading bots) was replaced after feedback from the Zcash India team; it remains in git history.

## Status (27 Nov 2026)

Verified end to end on NEAR Intents mainnet with a virtual passkey (no money moved): wallet created with one Face ID in ~13 s, a payee approved with one Face ID (a `policy_update`) in ~5 s, a live quote (₹500 to a USDC-on-Base payee = 0.0073 ZEC + ~$0.04 fees, correctly blocked for an empty wallet), a payment link that produced a real USDC-on-Base deposit address converting to ZEC on arrival, and an AI-drafted weekly Autopay.

| Feature | State |
|---|---|
| Wallet (passkey-owned NEAR Intents account, private balance, 13 coins on 8 chains) | Done |
| Home: total balance in INR/USD, coin cards, quick actions, last payments | Done |
| Add money: one-time deposit address for any coin, QR + wallet link, live status | Done |
| Payees: wallet addresses or Zorro @handles; batch approval with one Face ID | Done (verified on mainnet) |
| Pay: amount in INR/USD/coin, live quote in ZEC with fees, convert-then-send engine with idempotent steps | Built; **real-money payment pending your go-ahead** |
| Zorro-to-Zorro instant transfers by @handle (recipient sees it in their ledger) | Built; real transfer pending |
| Scan to pay: camera QR (jsQR) or paste; ZIP-321, EIP-681, Solana Pay, BIP-21, plain addresses | Done |
| Autopay: weekly/monthly at 9:00 IST, INR/USD/coin amounts, pause/resume/pay now/delete | Done (runs via the worker) |
| Get paid: payment links, payer picks any coin, arrives as ZEC | Done (deposit address verified) |
| Tracker: monthly totals, today's limit, where your ZEC went, stacked receipts, CSV export | Done |
| Ask AI: plain words → drafted payment or Autopay, reviewed before anything moves | Done |
| Zcash news + AI daily brief | Done |
| Landing page (`/landing`, also Home when signed out): animated product walkthrough for phones, ending in passkey sign-up | Done |
| Pay from another wallet (1Click, e.g. straight from Zashi) | Kept from v1 |

Still to do: one small real payment (and a shielded `u1` delivery test), deployment with HTTPS and an always-on worker, demo video and the X post.

## Run locally

Requires Node 22+.

```bash
cp .env.example .env.local   # fill in the keys (see comments in the file)
npm install
npm run db:migrate           # creates ~/.zorro/zorro.db (outside the project, see src/db/url.ts)
npm run dev                  # http://localhost:3000
npm run worker               # in a second terminal: runs payments, Autopay, payment links
```

Set `ZORRO_ENCRYPTION_KEY` to 32 random bytes, e.g. `openssl rand -base64 32`.

To try it on your phone, run `npm run dev -- -H 0.0.0.0` and open `http://<your-computer's-LAN-IP>:3000` on a phone on the same Wi-Fi.

Other commands: `npm test` (unit tests), `npm run typecheck`, `npm run lint`, `npm run db:generate` (new migration after editing `src/db/schema.ts`).

## Project layout

```
src/app/                 screens: / (Home), /pay, /pay/[id] (receipt), /payees, /autopay, /request,
                         /r/[id] (public payment link), /scan, /tracker, /ask, /news, /account,
                         /wallet/setup, /wallet/receive, /swap + /orders (pay from another wallet)
src/app/api/             payees, pay/quote, payments, schedules, requests, tracker (+ CSV), wallet/home,
                         agent (wallet setup, deposits), ai/payment, news, health, auth, me
src/lib/payments.ts      payment engine: quote, queue, convert → send steps, ledger, CSV
src/lib/payees.ts        payees and Face ID approval (policy_update)
src/lib/schedules.ts     Autopay (9:00 IST runs)
src/lib/requests.ts      payment links (deposit addresses that convert to ZEC)
src/lib/coins.ts         the 13 coins Zorro pays in, address checks, payment URIs
src/lib/scan.ts          payment-code parser (ZIP-321, EIP-681, Solana Pay, BIP-21)
src/lib/worker.ts        worker tick (scripts/worker.ts runs it every 5 s)
src/lib/agent-api.ts     typed NEAR Intents Agent API client (server only)
src/lib/ai.ts            AI client with output validation and data guard (server only)
drizzle/                 database migrations
brand/                   logo source
```
