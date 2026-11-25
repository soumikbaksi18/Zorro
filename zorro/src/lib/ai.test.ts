import { describe, expect, it } from "vitest";
import { assertNoSensitiveData } from "./ai";

describe("assertNoSensitiveData", () => {
  it("allows ordinary strategy text", () => {
    expect(() =>
      assertNoSensitiveData("Sell half my ZEC if it drops 10%, buy back when it recovers 5%. Budget $50 a day."),
    ).not.toThrow();
  });

  it.each([
    ["Zcash transparent address", "send to t1JM15Ahts5Vqwqa9SPryUB7YZu9WcLAyaK"],
    ["Zcash unified address", "u1" + "q".repeat(100)],
    ["EVM address", "my wallet 0x2527D02599Ba641c19FEa793cD0F167589a0f10D"],
    ["Solana address", "13QkxhNMrTPxoCkRdYdJ65tFuwXPhL5gLS2Z5Nr6gjRK"],
    ["grant token", "ngt_abcdefghijklmnopqrstuvwxyz0123456789"],
    ["JWT API key", "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2IjoxLCJrZXlfdHlwZSI6ImFnZW50In0.sig"],
  ])("blocks a %s", (_label, text) => {
    expect(() => assertNoSensitiveData(text)).toThrow(/Refusing/);
  });
});
