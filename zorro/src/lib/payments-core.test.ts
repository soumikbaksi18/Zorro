import { describe, expect, it, vi } from "vitest";
import { ceilDecimal, coin, fromUnits, isValidAddress, paymentUri, toUnits } from "./coins";

// schedules.ts imports the database and payment engine; stub them so the pure date maths can be tested.
vi.mock("@/db", () => ({ db: {}, schema: {} }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
const { nextRunAfter } = await import("./schedules");

const IST = 330 * 60_000;
const ist = (d: Date) => new Date(d.getTime() + IST);

describe("Autopay dates (9:00 IST)", () => {
  it("monthly: the next given day of the month, at 9:00 India time", () => {
    const after = new Date("2026-11-27T10:00:00Z"); // 27 Nov, 15:30 IST
    const next = nextRunAfter("monthly", 1, after);
    expect(next.toISOString()).toBe("2026-12-01T03:30:00.000Z"); // 1 Dec 09:00 IST
    expect(nextRunAfter("monthly", 27, new Date("2026-11-27T02:00:00Z")).toISOString()).toBe("2026-11-27T03:30:00.000Z"); // later today
    expect(nextRunAfter("monthly", 27, new Date("2026-11-27T03:30:00Z")).toISOString()).toBe("2026-12-27T03:30:00.000Z"); // strictly after
  });

  it("monthly: rolls over the year", () => {
    expect(nextRunAfter("monthly", 5, new Date("2026-12-20T00:00:00Z")).toISOString()).toBe("2027-01-05T03:30:00.000Z");
  });

  it("weekly: the next given weekday", () => {
    const after = new Date("2026-11-27T10:00:00Z"); // Friday
    const fri = nextRunAfter("weekly", 5, after);
    expect(ist(fri).getUTCDay()).toBe(5);
    expect(fri.toISOString()).toBe("2026-12-04T03:30:00.000Z");
    const mon = nextRunAfter("weekly", 1, after);
    expect(mon.toISOString()).toBe("2026-11-30T03:30:00.000Z");
  });
});

describe("coin maths", () => {
  it("converts amounts without float errors", () => {
    expect(toUnits("1.5", 8)).toBe("150000000");
    expect(toUnits("20", 6)).toBe("20000000");
    expect(fromUnits("150000000", 8)).toBe("1.5");
    expect(fromUnits("1", 24)).toBe("0.000000000000000000000001");
  });

  it("rounds up so a payee is never short-paid", () => {
    expect(ceilDecimal(0.0123451, 6)).toBe("0.012346");
    expect(ceilDecimal(20, 6)).toBe("20");
    expect(ceilDecimal(19.999999999999996, 6)).toBe("20");
  });

  it("validates addresses per chain", () => {
    expect(isValidAddress("evm", "0x2527D02599Ba641c19FEa793cD0F167589a0f10D")).toBe(true);
    expect(isValidAddress("evm", "0x2527")).toBe(false);
    expect(isValidAddress("zec", "t1JM15Ahts5Vqwqa9SPryUB7YZu9WcLAyaK")).toBe(true);
    expect(isValidAddress("tron", "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8")).toBe(true);
    expect(isValidAddress("btc", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")).toBe(true);
    expect(isValidAddress("near", "alice.near")).toBe(true);
    expect(isValidAddress("near", "Alice.near")).toBe(false);
  });

  it("builds wallet links payers can open", () => {
    expect(paymentUri(coin("zec"), "t1abc", "50000000")).toBe("zcash:t1abc?amount=0.5");
    expect(paymentUri(coin("usdc-base"), "0xabc", "25000000")).toBe(
      "ethereum:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913@8453/transfer?address=0xabc&uint256=25000000",
    );
    expect(paymentUri(coin("sol"), "So1", "1500000000")).toBe("solana:So1?amount=1.5&label=Zorro");
    expect(paymentUri(coin("usdt-tron"), "T1", "1")).toBeNull();
  });
});
