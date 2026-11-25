// Zorro bot worker: `npm run worker`
// Runs every BOT_TICK_MS (default 15s): reads the ZEC price, evaluates every active bot, acts.
// Runs alongside the web app and shares its database.

import { runTick } from "../src/lib/bots/runner";

const TICK_MS = Number(process.env.BOT_TICK_MS ?? 15_000);
let stopping = false;
let running = false;

const stamp = () => new Date().toISOString().slice(11, 19);

async function loop() {
  while (!stopping) {
    running = true;
    try {
      const s = await runTick((msg) => console.log(`[${stamp()}] ${msg}`));
      if (s.actions.length || s.source === "demo") {
        console.log(`[${stamp()}] tick: ZEC $${s.priceUsd.toFixed(2)} (${s.source}), ${s.bots} active bot(s), ${s.actions.length} action(s)`);
      }
    } catch (e) {
      console.error(`[${stamp()}] tick failed:`, e instanceof Error ? e.message : e);
    }
    running = false;
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
}

function shutdown() {
  stopping = true;
  console.log(`[${stamp()}] stopping after the current tick…`);
  const wait = setInterval(() => {
    if (!running) {
      clearInterval(wait);
      process.exit(0);
    }
  }, 200);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`[${stamp()}] Zorro bot worker started (tick every ${TICK_MS / 1000}s)`);
void loop();
