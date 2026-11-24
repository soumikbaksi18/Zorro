# Zorro: Plan

**Zorro is a phone-first web app for ZEC holders.** You can set take-profit, stop-loss, limit orders and recurring buys (DCA) for Zcash, all run through NEAR Intents. Zorro never holds your keys or your funds.

Built for the Zcash India "Build on Zcash" bounty (Nov 2026).

---

## 1. Problem and positioning

ZEC holders can already do instant swaps (Zodl, Cake, Brave, ZTippy), and NEAR Intents added native limit orders to its 1Click API on 28 Aug 2026. Things still missing for an ordinary holder on their phone:

- **Stop-loss.** NEAR Intents only supports `LIMIT` orders. It can't "sell if the price drops below X".
- **Recurring buys that land shielded.** Existing ZEC DCA (Kraken, 3Commas) runs on exchange accounts, and nothing lands in a shielded address.
- **One place to see and manage everything** (orders, schedules, alerts) on a phone, with INR prices.

**Our angle:** a simple, phone-first "set it and forget it" app for ZEC that is shielded by default and never holds your funds. It works with the user's own wallet (Zodl) through payment links.

> **Novelty risk.** The Zodl Desktop site advertises limit orders, TWAP and DCA for shielded ZEC. We couldn't confirm it's live or official. Our differentiators are stop-loss, phone-first design, shielded DCA and the India/INR focus. Verify Zodl Desktop's actual features in Phase 0 and adjust the pitch.

---

## 2. Features

### MVP (bounty submission)
| Feature | What the user does |
|---|---|
| Live price | ZEC price in USD and INR, simple chart |
| Swap now | Market swap ZEC ↔ USDC with one tap |
| Take-profit / limit sell | "Sell 2 ZEC if price ≥ $900" |
| Limit buy | "Buy ZEC with 100 USDC if price ≤ $650" |
| Stop-loss | "Sell 2 ZEC if price ≤ $600" |
| DCA (recurring buy) | "Buy ₹2,000 of ZEC every Friday", landing in a shielded address |
| Price alerts | "Notify me at $800" |
| Order tracker | Status of every order and swap (open, filled, refunded) |
| Push notifications | Phone notification when something triggers or fills |

### Later (only if time allows)
- **Bracket orders:** take-profit and stop-loss together on the same ZEC; one cancels the other.
- **DCA sell:** recurring take-profit, e.g. "sell 0.1 ZEC every week".
- **Portfolio view:** read-only, using a viewing key, decrypted in the browser.
- **Privacy checks:** warn about reused refund addresses, round amounts and predictable timing.
- **Fully automatic execution:** an optional small "strategy wallet" with spending limits (see §4.3).
- **Telegram notifications** as an alternative to web push.

---

## 3. What we verified about NEAR Intents (24–25 Nov 2026)

Tested directly against `https://1click.chaindefuser.com`:

- **Native ZEC is supported:** asset ID `nep141:zec.omft.near`, 8 decimals. The token list includes a live price.
- **Dry quotes work without an API key.** 1 ZEC → 737.21 USDC on Base, time estimate ~457 s, refund fee 0.00032 ZEC.
- **Real quotes and limit orders need auth** (`X-API-Key` or JWT). We need a NEAR Intents partner API key.
- **Limit orders** (`POST /v0/orders`, `orderType: LIMIT`, `side: BUY|SELL`) support `depositType: ORIGIN_CHAIN`. The user sends ZEC to a normal deposit address, and the order **rests until filled, cancelled or expired** (default deadline 7 days, partial fills allowed).
- **No stop-loss, TWAP or DCA order types.** The spec reserves `UNTRIGGERED` "for future order types", so NEAR may add triggers later.
- **No testnet.** NEAR Intents is mainnet only, so we test with small real amounts.

Stablecoin asset IDs we'll use first:
- USDC on Base: `nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near`
- USDC on Solana: `nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near`

---

## 4. How it works

### 4.1 Core principle: every action is a payment link

Zorro never asks for a seed phrase and never connects to a wallet. When money needs to move, Zorro creates a **payment link** with the exact amount and destination already filled in. The user taps it, their own wallet opens, and they confirm.

| Paying with | Link format | Opens in |
|---|---|---|
| ZEC | ZIP-321 (`zcash:<addr>?amount=…`) | Zodl and other Zcash wallets |
| USDC on Base | EIP-681 (`ethereum:…/transfer?…`) | MetaMask, Coinbase Wallet |
| USDC on Solana | Solana Pay (`solana:<addr>?amount=…&spl-token=…`) | Phantom, Solflare |

Funds are only ever in **the user's wallet** or **in NEAR Intents** (a deposit address or a resting order). Never with Zorro.

### 4.2 How each feature runs

| Feature | Mechanism | Fully automatic? |
|---|---|---|
| Swap now | `POST /v0/quote` → deposit address → payment link → track with `/v0/status` | User confirms once |
| Take-profit / limit sell | **Native** NEAR Intents `LIMIT SELL` order. User deposits ZEC once and it rests until the price is hit | ✅ Yes, after one deposit |
| Limit buy | **Native** `LIMIT BUY` order funded with USDC | ✅ Yes, after one deposit |
| Stop-loss | Zorro's background worker watches the price. When it triggers: fresh quote → push notification → tap → payment link → user confirms | ⚠️ One tap when triggered |
| DCA | Zorro's scheduler, each run: fresh quote (USDC → ZEC, recipient = the user's shielded address) → push → tap → confirm | ⚠️ One tap per buy |
| Price alerts | Worker watches price → push | ✅ |

**Why stop-loss and DCA need one tap:** quotes expire and Zorro can't sign for the user. That's the cost of never holding funds, and we'll say so openly in the app and the pitch.

### 4.3 Possible upgrade: fully automatic mode
An optional, small **strategy wallet**: a dedicated shielded wallet held **on the user's own device**, funded with a capped budget, that signs stop-loss and DCA trades automatically within limits the user sets. Post-MVP, because it means in-browser Zcash signing (WebZjs) and careful key storage.

---

## 5. Architecture

```
 ┌──────────────── Phone (installed web app) ───────────────┐
 │  Next.js UI  ·  service worker (push)  ·  device ID     │
 └───────────────┬──────────────────────────▲───────────────┘
                 │ HTTPS                    │ Web Push
 ┌───────────────▼──────────────────────────┴───────────────┐
 │                   Zorro server (Node)                    │
 │  API routes: orders, DCA plans, alerts, push subscribe   │
 │  Worker (every 15–30 s):                                 │
 │    • price poller  • trigger engine (stop-loss, alerts)  │
 │    • DCA scheduler • status poller  • push sender        │
 │  Database: SQLite (dev) → Postgres (deployed)            │
 └───────────────┬──────────────────────────────────────────┘
                 │
 ┌───────────────▼──────────────┐   ┌──────────────────────────┐
 │  NEAR Intents 1Click API     │   │  Prices: 1Click token    │
 │  quote · orders · status     │   │  list + CoinGecko + an   │
 └──────────────────────────────┘   │  INR exchange rate       │
                                    └──────────────────────────┘
 User's own wallets: Zodl (ZIP-321) · MetaMask (EIP-681) · Phantom (Solana Pay)
```

**No accounts.** Each phone gets a random device ID stored in the browser, linked to its push subscription. Orders belong to that device. Optional later: a backup code to move to a new phone.

---

## 6. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind | Fast to build, installable as a phone app |
| Installable app | Web app manifest + service worker | Add to home screen, push notifications |
| Charts | TradingView `lightweight-charts` | Small, works well on phones |
| Backend | Next.js API routes + a Node worker process | One codebase, one language |
| Database | Drizzle ORM + SQLite → Postgres | Simple locally, easy to move |
| Push | `web-push` (VAPID) | Standard, free |
| NEAR Intents | Small typed `fetch` client (or `@defuse-protocol/one-click-sdk-typescript`) | Only ~5 endpoints needed |
| Validation | `zod` | Validate all API input and output |
| Hosting | Railway or Fly.io (one service runs app and worker) | The worker must run continuously; Vercel serverless can't |

---

## 7. Data model

```
devices      id, push_subscription, created_at
addresses    id, device_id, chain (zec|base|sol), address, label
orders       id, device_id, kind (market|limit|take_profit|stop_loss),
             side (buy|sell), base_amount, trigger_price, slippage_bps,
             status (armed|triggered|awaiting_deposit|open|filled|refunded|
                     expired|cancelled|failed),
             oneclick_order_id, deposit_address, quote_deadline,
             created_at, updated_at
dca_plans    id, device_id, source_asset, amount_fiat, fiat (INR|USD),
             cadence (daily|weekly|monthly), next_run_at, jitter (bool), active
dca_runs     id, plan_id, quote_id, deposit_address, status, created_at
alerts       id, device_id, direction (above|below), price, fired_at
prices       ts, zec_usd, usd_inr   (short rolling window, for chart and triggers)
```

---

## 8. Key flows

**Stop-loss**
1. User: "Sell 2 ZEC if price ≤ $600", picks USDC on Base, enters their Base address.
2. Worker sees ZEC ≤ $600 → requests a live quote (exact input 2 ZEC, user's slippage).
3. Push: "🦊 Stop-loss hit at $598. Tap to sell 2 ZEC (quote valid 20 min)."
4. Tap → order screen → "Open in Zodl" (ZIP-321 link) → user confirms.
5. Worker tracks `/v0/status` → push "Done: 1,182 USDC sent to your Base wallet."
6. If the quote expires before the user confirms, Zorro fetches a new one on next open.

**Take-profit**
1. User: "Sell 2 ZEC at $900" → Zorro creates a native `LIMIT SELL` order.
2. User deposits 2 ZEC with one tap (ZIP-321).
3. The order rests with NEAR Intents. Zorro polls it, pushes on fill or partial fill, and re-creates it at the 7-day expiry if the user wants.

**DCA**
1. User: "₹2,000 every Friday, pay with USDC on Solana, deliver to my shielded ZEC address."
2. Each Friday (± random jitter) → quote USDC → ZEC → push → tap → Phantom opens prefilled → confirm.
3. ZEC arrives in the user's shielded address. The plan shows runs, average buy price and total stacked.

---

## 9. Privacy and security

- **Never** ask for or store a seed phrase or spending key.
- Store only what's needed (addresses, order settings). Delete completed order data after N days. Let the user delete everything with one button.
- **Be honest in the app:** NEAR Intents swaps are publicly visible on NEAR, and the refund address is recorded there. Encourage a fresh shielded address for each swap.
- Optional jitter on DCA timing and amount, so buys are harder to link.
- Rate-limit the API. Validate every address format before quoting.
- Keep the NEAR Intents API key on the server only.

---

## 10. Risks and open questions (settle in Phase 0)

| # | Question | How we check |
|---|---|---|
| 1 | Does 1Click accept a **shielded unified address** (`u1…`) as ZEC recipient and refund address? | One small real swap |
| 2 | **Minimum amounts** for ZEC quotes and limit orders? | Dry quotes at small sizes |
| 3 | API key: how to get one, and what are the fees and rate limits? | NEAR Intents partner docs and portal |
| 4 | How long do quote deposit addresses stay valid? (sets the stop-loss "tap window") | Live quote, read `deadline` |
| 5 | Is a ZEC-funded `LIMIT SELL` actually fillable, and how quickly? | One small real order |
| 6 | iPhone push only works after "Add to Home Screen" (iOS 16.4+) | Test on a real iPhone |
| 7 | Does Zodl open ZIP-321 links from the phone browser with amounts filled in? | Test on Android and iOS |
| 8 | Is Zodl Desktop's advertised limit/DCA feature real? (affects our pitch) | Install it or check its release notes |
| 9 | Large exits through NEAR Intents can be held for compliance (one forum report: $589k held 50 days) | Warn users; keep demo amounts small |
| 10 | "Zorro" is a registered trademark | Fine for a hackathon; revisit before any public launch |

---

## 11. Build phases

| Phase | Goal | Done when |
|---|---|---|
| **0. Verify** | Answer the questions in §10 with real tiny transactions | Every question has an answer, and the plan is adjusted |
| **1. Skeleton** | Installable app, device ID, live ZEC price (USD/INR) and chart | App installs on a phone and shows live price |
| **2. Swap now** | Quote → payment link → status tracking, end to end | A real ZEC → USDC swap from the phone |
| **3. Limit and take-profit** | Native 1Click orders: create, deposit, track, cancel | A real resting order fills or cancels correctly |
| **4. Stop-loss and alerts** | Worker, trigger engine, web push | A push arrives and the tap leads to a completed swap |
| **5. DCA** | Plans, scheduler, runs, stats | Two scheduled runs complete |
| **6. Polish** | Order history, empty and error states, privacy notes, **demo mode** | Clean demo on a real phone |
| **7. Submit** | README, demo video, X post | Entry posted |

**Demo mode:** a hidden switch that overrides the price feed, so judges see a stop-loss trigger live instead of waiting for the market.

---

## 12. Bounty submission checklist

- [ ] Public GitHub repo with a clear README (what, why, how it works, how to run)
- [ ] Deployed app URL that installs on a phone
- [ ] 2–3 minute demo video: set stop-loss → trigger (demo mode) → push → Zodl → USDC received
- [ ] **An original public X post tagging @ZcashIND** (a GitHub upload alone doesn't count as an entry)
- [ ] Confirm the deadline and terms on the @ZcashIND bounty post

---

## 13. Brand

- **Logo:** [`brand/zorro-logo.png`](brand/zorro-logo.png), a low-poly masked fox (1254×1254, black background).
- **Palette (approximate, taken from the logo):**
  - Fox purple `#8A3FC8`, light `#B86AE6`, dark `#5B2491`
  - Accent green `#6CC24A`, dark `#2E8B3A`
  - Gold `#E9B33B`
  - Off-white `#F1EEF5`
  - Background `#0A0A0A`
- **App theme:** dark by default, purple for main actions. Green and red keep their usual price meaning (up and down), and gold is for alerts and notifications.
- **Small sizes:** the scar and earrings disappear below ~64 px, so make a simplified mark (ears, mask, white muzzle only) for the favicon and notification badge.

---

## 14. Decisions needed before building

1. **Deadline and team size.** These set how much of "Later" we attempt.
2. **Stablecoin chains for v1.** Recommendation: USDC on Base and on Solana only.
3. **Hosting.** Recommendation: Railway (simplest for app + worker).
4. **The existing scaffold.** A default Next.js starter was created in `zorro/` before the plan. Keep it as the starting point, or delete it and start fresh in Phase 1.
