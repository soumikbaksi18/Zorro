"use client";

import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { api } from "@/lib/api-client";

type Demo = { enabled: boolean; price: { priceUsd: number; setAt: string } | null };

/** Demo mode (development only): feed bots a chosen ZEC price to show a stop-loss firing. */
export function DemoPanel() {
  const [demo, setDemo] = useState<Demo | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<Demo>("/api/demo/price")
      .then((d) => !cancelled && setDemo(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!demo?.enabled) return null;

  async function save(priceUsd: number | null) {
    setError(null);
    try {
      setDemo(await api<Demo>("/api/demo/price", { priceUsd }));
      setValue("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <section className="panel border-gold/40 p-5" aria-labelledby="demo-heading">
      <div className="flex items-center gap-2">
        <FlaskConical size={16} className="text-gold" aria-hidden="true" />
        <h2 id="demo-heading" className="eyebrow text-gold">
          Demo mode
        </h2>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        Feed the bot worker a fake ZEC price to show a bot triggering. Paper bots stay simulated; live bots would really
        trade at the real market price. Development only.
      </p>
      <p className="mt-3 text-sm">
        {demo.price ? (
          <>
            Bots see <span className="font-medium text-gold">${demo.price.priceUsd}</span> instead of the real price.
          </>
        ) : (
          "Bots see the real NEAR Intents price."
        )}
      </p>
      <div className="mt-3 flex gap-2">
        <input
          inputMode="decimal"
          placeholder="Fake price, e.g. 500"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))}
          className="field min-h-10 text-sm"
          aria-label="Demo ZEC price in USD"
        />
        <button type="button" onClick={() => save(Number(value))} disabled={!Number(value)} className="btn-primary min-h-10 shrink-0 px-4 text-[13px]">
          Set
        </button>
      </div>
      {demo.price && (
        <button type="button" onClick={() => save(null)} className="btn-secondary mt-2 min-h-10 w-full text-[13px]">
          Use the real price again
        </button>
      )}
      {error && <p className="mt-2 text-xs text-down">{error}</p>}
    </section>
  );
}
