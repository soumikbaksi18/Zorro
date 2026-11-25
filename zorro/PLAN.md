# Zorro Bots: Plan

**Zorro is a phone-first app of private, automatic trading bots for ZEC.** Users pick a strategy (DCA, stop-loss, take-profit ladder, grid), or describe one in plain words to the AI assistant. A bot runs it 24/7 from the user's own NEAR Intents agent wallet, within spending limits they sign once with Face ID or a fingerprint. Zorro can trade within those limits but can never send funds anywhere except the user's own addresses.

Built for the Zcash India "Build on Zcash" bounty (Nov 2026).

---

## 1. Problem and positioning

- ZEC holders can swap (Zodl, Cake, Brave), and NEAR Intents has native limit orders. But there's **no automated ZEC trading** that keeps users in control of their funds. The only ZEC bots found (3Commas, WunderTrading) run on exchange accounts.
- **Stop-loss doesn't exist anywhere for ZEC** outside exchanges. NEAR Intents only offers limit orders.
- Trading bots usually mean handing an exchange or bot service your money. Zorro's pitch: **your funds stay in your own wallet, the bot can only trade within limits you sign, and profits go back to you.**
- **Private by default:** agent balances on NEAR Intents are confidential, and ZEC is the asset.

> **Novelty check (25 Nov 2026):** no non-custodial ZEC bot found. nearkit (a NEAR toolkit) has generic automation, not ZEC-focused. Zodl Desktop advertises limit orders, TWAP and DCA for shielded ZEC (unverified). Zorro's differentiators: stop-loss and trailing stop, grid, backtesting, AI strategy assistant, signed spending limits, phone-first with INR.

---

## 2. How it works

```
 User's phone                      Zorro server                     NEAR Intents
 ────────────                      ────────────                     ────────────
 1. Create passkey (Face ID) ──►   builds agent_create intent ──►  Agent API
 2. Sign ONE intent:                (policy + first grant)          creates the user's
    "this agent may swap ZEC/USDC,                                  agent wallet (custody:
     max $X/day, withdraw only                                      OutLayer), policy on-chain
     to MY addresses"
 3. Deposit ZEC (ZIP-321 link) ─────────────────────────────────►  agent balance (confidential)
 4. Choose/describe a bot ──────►  bot engine (24/7 worker)
                                    • watches price
                                    • decides (strategy rules)
                                    • swaps / limit orders  ──────►  executed within the signed policy
                                      with the grant token
 5. Withdraw profits ◄──────────────────────────────────────────── only to the user's listed addresses
```

**Who controls what**
| Party | Can do | Cannot do |
|---|---|---|
| User (passkey owner) | Create/freeze/delete agent, change policy, revoke Zorro's grant, approve withdrawals | Lose access if passkey is lost: owner keys can't be changed (passkeys sync via iCloud/Google, so this is usually fine) |
| Zorro (grant holder) | Swaps and limit orders within policy; withdrawals only to user-listed addresses | Change the policy, add destinations, exceed budget or limits |
| NEAR Intents / OutLayer | Hold and settle funds per the signed policy | (Trust assumption: their custody wallet and TEE-hosted API) |

**Manual mode stays:** the "Swap now" screen (already built) keeps working for one-off swaps from the user's own wallet.

---

## 3. Bots

| Bot | Rule | Executes via | MVP? |
|---|---|---|---|
| **Smart DCA** | Buy $X every period; buy more when price is below its average | Market swap (USDC → ZEC) | ✅ |
| **Stop-loss / trailing stop** | Sell when price ≤ X, or drops Y% from its peak since start | Market swap (ZEC → USDC), triggered by Zorro's price watcher | ✅ |
| **Take-profit ladder** | Sell 25% at $800, 25% at $900, … | Native resting limit orders | ✅ |
| **Grid** | Buy/sell repeatedly within a price range at N levels | Limit-order ladder, re-armed as orders fill | ✅ (showcase) |
| TWAP exit | Sell a large amount in slices over time | Scheduled swaps | Later |
| Rebalance | Keep ZEC/USDC at a target ratio | Periodic swaps | Later |

Every bot has: **backtest before launch** (last 1/7/30 days, with fees), **pause/resume**, **activity log with reasons**, and **"sweep profits to my address"**.

---

## 4. AI assistant

The AI turns words into bots and explains them. It **never places trades itself**: it only produces a bot configuration, which is validated, backtested and confirmed by the user. All execution goes through the deterministic bot engine and the signed policy.

| Feature | Example |
|---|---|
| Describe a strategy | "Sell half my ZEC if it drops 10%, buy back if it recovers 5%" → stop-loss + re-entry bot config |
| Explain a backtest | "This grid made 3.1% over 30 days, mostly from the 22–24 Nov swings" |
| Explain an action | "Why did my bot sell?" → reads the activity log |
| (Later) AI tuning | Suggests parameter changes within user-set ranges; user approves |

- **Provider:** DeepSeek, an OpenAI-compatible API (`DEEPSEEK_API_KEY`, server-side only). The UI says "AI-powered" without naming the provider.
- **Data sent:** strategy text, market data and bot settings only. **Never** addresses, balances, keys or tokens.
- **Disclosure in UI:** "AI features send your strategy text to a third-party AI service."
- **Safety:** model output must pass a strict schema (zod) and range checks; anything invalid is rejected, not guessed.

---

## 5. Verified facts (25 Nov 2026)

**1Click API** (`https://1click.chaindefuser.com`)
- Quotes and status work without a key. With our partner key, quotes show the documented fee (~0.20%, 0.01% for stablecoin pairs). Keyless quotes don't show the documented 0.25% surcharge.
- Shielded `u1…` addresses pass validation as ZEC recipient/refund, **but the docs list ZEC as "transparent addresses only"**. Must test real delivery to `u1`.
- Minimum ZEC swap 0.00132 ZEC. Buying ZEC has a fixed ~0.00032 ZEC withdrawal fee.
- ZEC deposit addresses are transparent (`t1…`). Deposit window ~3 days.

**Agent API** (`https://api.agentsonintents.com`, spec at `/openapi.json`)
- Our Agent API key works (`/v1/whoami` 200). It's a separate key from the 1Click key.
- **Experimental, mainnet-only beta. Docs warn users "may lose all assets".** No testnet.
- Owner types live: **NEAR and passkey** (EVM off). Passkey: ES256, user verification required, P-256 SPKI public key, exact HTTPS origin, no cross-site iframes.
- **Native ZEC is in the agent token list** (`nep141:zec.omft.near`), plus USDC on many chains.
- Agent creation: `POST /v1/generate-intent` (`agent_create` with owner, full policy and optional first grant, all under **one signature**) → owner signs (`webauthn`) → `POST /v1/submit-intent` → poll `GET /v1/status`.
- Grants: Zorro generates an `ngt_…` token, sends only its SHA-256 hash; sends `X-Grant-Token` on trades. Max 365 days.
- Policy: actions (`swap`, `limit_order`, `withdraw`, `transfer`), assets, per-tx/hourly/daily/monthly limits, USD budget, max actions per hour, destinations (`only` list), owner approval, timelock, schedule, `limit_order.max_deviation_bps` (0–300).
- Actions: `deposit` (address from another chain), `swap` (with `dry` quote), `limit-orders` (place/list/cancel), `withdraw`, `balances`, receipts and history.
- Quotas: 1,000 agents/day, 1,500 req/min per key, **1,000 custody ops per agent per 24h**, one money action at a time per agent, policy change ≤ 1 per 10 min. Every live action needs an `Idempotency-Key`.

---

## 6. Architecture

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router, Cache Components) + TypeScript + Tailwind, installable phone web app (existing) |
| Passkeys | WebAuthn in the browser (`@simplewebauthn/browser`), ES256, convert COSE → P-256 SPKI |
| Database | libsql via Drizzle: a local SQLite file in dev, a hosted libsql/Turso database when deployed (same code). Tables: users, agents, grants (encrypted tokens), bots, bot_events, operations |
| Secrets at rest | Grant tokens encrypted (AES-256-GCM) with a server key (`ZORRO_ENCRYPTION_KEY`) |
| Bot engine | Long-running Node worker: price loop (15s), strategy evaluation, execution queue (one action per agent at a time), retries with the same Idempotency-Key |
| Backtester | Pure TypeScript, runs strategies over CoinGecko history with a fee model |
| AI | DeepSeek chat completions with JSON output, validated by zod |
| Hosting | Railway or Fly.io (always-on worker + HTTPS, required for passkeys). Local testing over an HTTPS tunnel (e.g. cloudflared) |

**Identity:** the passkey *is* the account. No email or password.

---

## 7. Default policy (proposed)

```
actions:        ["swap", "limit_order", "withdraw"]
assets:         ZEC, USDC (Base), USDC (Solana)
destinations:   only: [user's own ZEC address, user's own USDC address]
budget:         daily_usd = user's choice (default $50)
limits:         per_transaction ≤ budget; max_actions_per_hour = 20
limit_order:    max_deviation_bps = 100
owner_approval: false (true = every withdrawal needs Face ID)
confidential:   true
```

The UI shows this in plain words before the user signs: "Zorro can trade up to $50/day of ZEC and USDC. It can only send money to these 2 addresses, which are yours."

---

## 8. Build phases

| Phase | Goal | Done when |
|---|---|---|
| ✅ 1. Skeleton | Installable app, live price, chart | Done |
| ✅ 2. Swap now | Manual swaps via 1Click + payment links | Done (needs one real-funds test) |
| ✅ 3. Foundations | DB, Agent API client, AI client, encryption, system status, unit tests | Done: all five health checks pass against live services (HTTPS tunnel moves to Phase 4, where passkeys need it) |
| ✅ 4. Agent wallet | Passkey sign-up/sign-in → limits screen → agent_create + grant (one signature) → wallet screen | Done: verified end to end on mainnet (agent ACTIVE, owned by a passkey, grant accepted by a dry-run quote) |
| ✅ 5. Fund and withdraw | Deposit addresses (ZEC, USDC Base/Solana) with QR / wallet links, live balances + budget usage, withdrawal preview and send to signed addresses, activity | Built and verified against the live API with no funds (real deposit address, preview refusal). **Pending: one small real deposit + withdrawal** |
| ✅ 6. Bot engine + first bots | Worker (`npm run worker`), stop-loss, trailing stop, Smart DCA, paper/live modes, activity log, demo mode | Verified: paper stop-loss fired in demo mode with a real quote; live bot on an empty wallet paused safely without sending. **Pending: one small real live trade** |
| **7. Limit-order bots** | Take-profit ladder, grid | Ladder and grid place, fill/cancel and re-arm correctly |
| **8. Backtest + AI** | Backtester; "describe your strategy"; explanations | Plain-English request → valid bot → backtest → launch |
| **9. Polish and submit** | Demo mode, error states, privacy copy, README, video, X post | Clean demo on a real phone |

**Demo mode:** a hidden switch that feeds a scripted price path to the bot engine, so judges see a stop-loss and a grid fire live.

---

## 9. Risks and open questions

| # | Risk / question | Plan |
|---|---|---|
| 1 | Agent API is an experimental beta ("may lose all assets") | Small amounts only; say so plainly in the app and pitch |
| 2 | ZEC to shielded `u1` may not be delivered (docs: transparent only) | Test with a tiny real withdrawal; fall back to `t1` + "shield in Zodl" instruction |
| 3 | Passkeys need an exact HTTPS origin | Verified: `http://localhost` is accepted for local tests. Phones need HTTPS (tunnel or deployment). A passkey only works on the origin it was created on |
| 4 | Zorro's server holds grant tokens | Encrypt at rest; policy caps the damage (no foreign withdrawals, daily budget); user can revoke anytime |
| 5 | Price watcher accuracy for stop-loss | Use the 1Click/Agent API token price (same venue), plus slippage limits (`min_amount_out`) |
| 6 | 1,000 custody ops/day per agent | Grid levels and DCA frequency capped so a bot stays far below it |
| 7 | AI produces a bad strategy | Schema + range validation, mandatory backtest preview, user confirmation |
| 8 | "Zorro" is a registered trademark | Fine for a hackathon; revisit before public launch |

---

## 10. Brand

- **Logo:** [`brand/zorro-logo.png`](brand/zorro-logo.png), a low-poly masked fox.
- **Palette:** fox purple `#8A3FC8` (light `#B86AE6`, dark `#5B2491`), accent green `#6CC24A`, gold `#E9B33B`, off-white `#F1EEF5`, background `#0A0A0A`.
- Green/red keep their price meaning (up/down); gold is for alerts. Use a simplified mark below ~64 px.

---

## 11. Bounty submission checklist

- [ ] Public GitHub repo with a clear README
- [ ] Deployed app URL that installs on a phone
- [ ] 2–3 minute demo: create agent with Face ID → deposit → AI builds a stop-loss → demo-mode trigger → swap executes → withdraw
- [ ] **An original public X post tagging @ZcashIND** (a GitHub upload alone doesn't count)
- [ ] Confirm deadline and terms on the @ZcashIND bounty post
