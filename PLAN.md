# Zorro: Plan

**Zorro is private cash on your phone.** You hold ZEC and pay anyone, or spend at any app, in whatever coin they want: Zorro converts it at the moment you pay, through NEAR Intents. Regular payments (rent, family, freelancers) run on their own, and every conversion is tracked, so you always know what each payment cost you in ZEC.

Version 1 of Zorro was a ZEC trading-bot app; after feedback from the Zcash community ("the ecosystem sees Zcash as private cash, not a tradable asset"), all trading is removed. That plan is in git history.

---

## 1. Problem and positioning

- ZEC is meant to be **private money you spend**, but the people you pay and the apps you spend at usually want something else: USDC, SOL, BTC, ETH.
- Today, paying someone in another coin means swapping first, often pasting an address from *another* wallet app, then sending. There are no scheduled payments, no address book you can trust, and no record of what each payment cost you in ZEC.
- **Zorro:** keep everything in ZEC; pay in any coin; payments can repeat on a schedule; payees are approved once with Face ID; every conversion is recorded.

> **Novelty check (to do before Phase 1 ends):** Zashi's "CrossPay" (via NEAR Intents) already lets you pay an address in another coin from shielded ZEC. Confirm what it covers today. Zorro's differentiators: **Autopay** (scheduled payments), **instant Zorro-to-Zorro transfers by name**, **Face ID-approved payees**, **get paid in any coin, receive ZEC**, **conversion ledger with USD values**, and an **AI that sets up payments from plain words**.

---

## 2. What a user can do

| | Example | How it works |
|---|---|---|
| **Hold** | Keep ZEC as savings and spending money | One private balance on NEAR Intents (confidential), created with a passkey. It can also hold other coins, but ZEC is home |
| **Pay a person** | "Send Riya $20 in USDC on Base" | ZEC → USDC swap inside the wallet, then a withdrawal to her address. The screen shows what it costs in ZEC before you confirm |
| **Pay a Zorro user** | "Send @arjun 0.05 ZEC" | `transfer` between two NEAR Intents accounts: instant, private, no conversion |
| **Spend at an app** | Scan a checkout QR asking for 25 USDC | Read the payment request (ZIP-321, EIP-681, Solana Pay, or address + amount), pay the exact amount in the asked coin |
| **Autopay** | "Pay my landlord $200 in USDC on the 1st of every month" | A schedule the worker runs: quote → pay → receipt. Warns early if the ZEC balance won't cover it |
| **Get paid** | Send a client a link for $100 | A payment link where the payer chooses any supported coin; it arrives in Zorro as ZEC |
| **Track** | "What did I spend this month, and at what rates?" | A ledger of every payment and conversion: ZEC spent, coin delivered, rate, fees, status, in ZEC and USD. CSV export |
| **Ask** | "Pay Arjun $10 in SOL every Friday" | The AI drafts the payment or schedule; you review and confirm with Face ID |

**"Spend at any app" means any app that accepts crypto on a chain NEAR Intents supports** (EVM chains, Solana, Bitcoin, NEAR, Tron, and more). It is not a card: no UPI or card payments in this version.

---

## 3. How it works

```
 User's phone                         Zorro server                        NEAR Intents
 ────────────                         ────────────                        ────────────
 1. Create passkey (Face ID) ──────►  builds agent_create intent ──────►  Agent API creates the
 2. Sign the wallet rules once:        (rules + first grant)               user's wallet (confidential
    daily limit, approved payees                                           balance, any listed coin)
 3. Add ZEC (deposit address) ───────────────────────────────────────────► balance
 4. Pay / spend / autopay ─────────►  payment engine
                                       • quote: how much ZEC this costs
                                       • swap ZEC → asked coin (if needed) ► inside the wallet
                                       • withdraw to the payee  ──────────►  only to approved payees
                                       • or transfer to a Zorro user ─────►  instant, private
                                       • record it in the ledger
 5. Get paid: payment link ◄───────────────────────────────────────────── payer's coin, converted to ZEC
```

**Who controls what**
| Party | Can do | Cannot do |
|---|---|---|
| You (passkey owner) | Approve payees, set limits, freeze or delete the wallet, revoke Zorro | Recover a lost passkey (passkeys sync via iCloud / Google, so this is usually fine) |
| Zorro (grant holder) | Run payments you asked for, to approved payees, within the daily limit | Pay anyone you didn't approve, exceed the limit, change the rules |
| NEAR Intents | Hold and settle funds under the signed rules | (Trust assumption: their wallet provider and API) |

**Safety in one line:** a new payee always needs your Face ID (a `policy_update` signature), so even if Zorro's server were compromised, money could only go to people you approved, and only up to your daily limit.

---

## 4. Privacy model (say this plainly in the app and the pitch)

- Your Zorro balance is a **confidential balance on NEAR Intents**: amounts and history aren't public on a block explorer. Zorro-to-Zorro transfers stay inside it.
- **It is not Zcash's shielded pool.** ZEC arrives and leaves through transparent `t1` addresses (a NEAR Intents limit today). Recommended habit: keep long-term savings shielded in a Zcash wallet (Zashi, Vizor); top up Zorro for spending.
- **Must test (Phase 3):** a tiny real payout to a shielded `u1` address. If it's delivered, "pay a Zcash user privately" works end to end. If not, Zorro sends ZEC payees to `t1` only and says so.
- People you pay see only what lands at their address, not your balance or other payments.
- The AI never sees addresses, balances, keys or tokens: only your typed request and public prices.

---

## 5. Verified facts (26 Nov 2026)

**Agent API** (`https://api.agentsonintents.com`)
- Experimental mainnet beta (docs: "may lose all assets"): small amounts only.
- Owner types: NEAR and passkey. Passkeys need HTTPS (`http://localhost` works for local tests).
- One wallet = one NEAR Intents account with a **confidential balance** that can hold any of ~230 listed tokens.
- Actions used: `deposit` (address on any listed chain), `swap` (with `dry` quote), `withdraw` (to any listed chain, delivers the same symbol), `transfer` (to another NEAR Intents account; optional `reference` shown on the payee's receipt), `balances`, receipts and history.
- Rules (`policy`): actions, assets (`"any"` or a list), destinations allow-list, daily/weekly/monthly USD budget, per-asset limits, actions per hour, timelock, owner approval. **Adding a payee = one `policy_update` = one Face ID.** Policy changes: at most 1 per 10 minutes.
- Limits: one money action at a time per wallet (`wallet_busy`), 1,000 custody operations per wallet per day, `Idempotency-Key` on every payment (never resend an uncertain payment under a new key).
- Swap fee ~0.6% (shown before you confirm); withdrawals have a network fee per chain.

**1Click API** (`https://1click.chaindefuser.com`): used for "pay from your own external wallet" and for payment links. Min ZEC swap 0.00132 ZEC. ZEC deposit addresses are transparent `t1`.

**Already built and verified (from version 1):** passkey sign-up and sign-in, wallet creation with one signature (verified on mainnet), deposit addresses with QR and wallet links, balances, withdrawal preview, 1Click quotes and status, payment links (ZIP-321, EIP-681, Solana Pay), background worker with heartbeat, AI client with privacy guard, Zcash news tab with AI brief, health checks.

---

## 6. What happens to version 1

| Version 1 part | Fate |
|---|---|
| Passkeys, wallet creation, signed rules, grants (encrypted) | **Keep** |
| Deposits, balances, withdrawals, activity | **Keep** → Receive, Wallet, Pay, Activity |
| 1Click swap flow + payment links | **Keep** → "Pay from another wallet" and "Get paid" links |
| Background worker (heartbeat, one action at a time, idempotency, uncertain-status polling) | **Keep** → runs Autopay instead of bots |
| Smart DCA scheduling (`nextDcaRun`) | **Repurpose** → Autopay schedules |
| AI assistant + privacy guard + rate limit | **Repurpose** → "describe a payment" |
| Zcash news + AI brief | **Keep** (drop the "Markets" filter) |
| Stop-loss, trailing stop, take-profit ladder, grid, limit orders, backtester, strategy AI, price-trigger demo mode, "Bots" and "Orders" screens | **Remove** (code and tests deleted; remains in git history) |

Database: `bots` / `bot_events` tables are replaced by `payees`, `payments`, `schedules` (new migration); `operations`, `users`, `sessions`, `agents`, `grants` stay.

---

## 7. Default wallet rules

```
actions:        ["swap", "withdraw", "transfer"]       (no limit orders)
assets:         ZEC + curated spend coins (USDC Base/Solana/Ethereum, USDT, SOL, BTC, ETH, NEAR)
destinations:   only: approved payees (each one added with Face ID)
budget:         daily_usd = user's choice (default $100)
limits:         max_actions_per_hour = 20
owner_approval: false   (Face ID protects payees and the limit, not every payment)
confidential:   true
```

Shown in plain words before signing: "Zorro can pay up to $100 a day, only to people you've approved."

---

## 8. Build phases

| Phase | Goal | Done when |
|---|---|---|
| ✅ 1. Remove trading, new shell | Trading code removed; tab bar **Home · Pay · Tracker · News · Account**; Zcash-yellow brand with a Vaulta-style home and stacked receipt cards | Done: typecheck, lint, 47 unit tests and production build pass |
| ✅ 2. Wallet home + Receive | Balance card in USD, coin cards, quick actions, last payments; Add money for any coin | Done: verified with a real mainnet deposit address |
| ✅ 3. Payees + Pay | Payees (address or @handle), batch Face ID approval, quote in ZEC with fees, convert → send engine, receipts | Approval verified on mainnet (~5 s); quote verified. **Pending: one small real payment + `u1` test** |
| ✅ 4. Spend (scan to pay) | Camera (jsQR) + paste; ZIP-321, EIP-681, Solana Pay, BIP-21, plain addresses | Done (parser unit-tested; paste flow verified in the browser) |
| ✅ 5. Autopay | Weekly/monthly at 9:00 IST, USD or coin amounts, pause/resume/pay now/delete, skipped runs recorded | Done (date maths unit-tested; creation verified). Live run needs a funded wallet |
| ✅ 6. Get paid + Tracker | Payment links (payer picks any coin, arrives as ZEC); Tracker with monthly totals, today's limit, breakdown, receipts, CSV | Done: link produced a real deposit address |
| ✅ 7. AI payments | Plain words → drafted payment or Autopay → reviewed on the normal screen | Done: a weekly payment in plain words → correct weekly Autopay draft |
| **8. Polish and submit** | Demo mode (simulated schedule run), error states, privacy copy, deployment (HTTPS + always-on worker), README, video, X post | Clean demo on a real phone |

---

## 9. Risks and open questions

| # | Risk / question | Plan |
|---|---|---|
| 1 | Agent API is an experimental beta | Small amounts only; say so in the app and the pitch |
| 2 | ZEC to shielded `u1` may not be delivered (docs: transparent only) | Tiny real test in Phase 3; fall back to `t1` with a clear note |
| 3 | Overlap with Zashi CrossPay | Verify early; lead with Autopay, Zorro-to-Zorro, payees, tracker and get-paid links |
| 4 | Paying another coin is two steps (swap, then withdraw); either can fail | Quote both first; record each step; if the withdrawal fails, the converted coin stays in the wallet and the user can retry or convert back |
| 5 | Autopay when the user isn't around: price moves, balance too low | Fix amounts in the payee's currency; check the quote's warnings before sending; warn a day early; never send a doomed payment |
| 6 | Zorro's server holds grant tokens | Encrypted at rest; payees and daily limit cap the damage; user can revoke anytime |
| 7 | Policy changes limited to 1 per 10 minutes | Batch several new payees into one Face ID; explain the wait if needed |
| 8 | No fiat (UPI/card) | Out of scope for now; future work |
| 9 | Passkeys need HTTPS on phones | Deploy with HTTPS for the demo |

---

## 10. Architecture (unchanged)

Next.js 16 (App Router, Cache Components) + TypeScript + Tailwind, installable phone web app · passkeys (WebAuthn, `@simplewebauthn`) · libsql/SQLite via Drizzle (`~/.zorro/zorro.db` locally) · AES-256-GCM for grant tokens · always-on Node worker for Autopay · AI via an OpenAI-compatible API (the UI says "AI-powered" only) · news via NewsAPI.org.

---

## 11. Brand

- **Logo:** [`brand/zorro-logo.png`](brand/zorro-logo.png), a low-poly yellow fox with green hair (transparent PNG). App icons in `public/icons/`, `src/app/icon.png` and `src/app/apple-icon.png` are generated from it.
- **Palette (lime & deep green):** lime `#B8F36B` (light `#D4FA9A`, dark `#6FB83A`, text on lime `#0B1607`), deep green `#1F4A2A` for gradients, receipt tints `#EEFCD6` / `#D9F7A8` / `#BFEE7C`, red `#FF6B6B`, amber `#F5B14A` (notices), off-white `#F2F7EF`, background `#070B08`. Font: Sora.
- **Layout:** gradient "Main wallet" card, floating bottom bar with a raised lime Pay button, light lime "Sending money" sheet with slide-to-pay, Statistic chart with Income/Spend toggle, stacked lime receipts.
- Words: "pay", "send", "spend", "get paid". Never "trade", "bot", "profit".

---

## 12. Launch checklist

- [ ] Public GitHub repo with a clear README
- [ ] Deployed app URL that installs on a phone
- [ ] 2–3 minute demo: create wallet with Face ID → add ZEC → approve a payee → pay them in USDC (shows the ZEC cost) → set up a monthly Autopay → send @friend ZEC instantly → show the tracker
- [ ] Public launch post on X
