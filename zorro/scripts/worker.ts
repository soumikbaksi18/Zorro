// Zorro payment worker: `npm run worker`
// Runs every WORKER_TICK_MS (default 5s): Autopay runs, payment steps, payment links, deposits.
// Runs alongside the web app and shares its database.

import { runTick } from "../src/lib/worker";

const TICK_MS = Number(process.env.WORKER_TICK_MS ?? process.env.BOT_TICK_MS ?? 5_000);
let stopping = false;
let running = false;

const stamp = () => new Date().toISOString().slice(11, 19);

async function loop() {
  while (!stopping) {
    running = true;
    try {
      const s = await runTick((msg) => console.log(`[${stamp()}] ${msg}`));
      if (s.autopays || s.paidLinks || s.deposits) {
        console.log(`[${stamp()}] tick: ${s.autopays} autopay(s), ${s.steps} payment step(s), ${s.paidLinks} link(s) paid, ${s.deposits} deposit(s)`);
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

console.log(`[${stamp()}] Zorro payment worker started (tick every ${TICK_MS / 1000}s)`);
void loop();
