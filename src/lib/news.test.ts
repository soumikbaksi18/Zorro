import { describe, expect, it } from "vitest";
import { __test } from "./news";

const { clean, topicOf, parseDate } = __test;

const base = { link: "https://example.com/a", pubDate: "2026-11-26 09:30:00", source_name: "Example" };

describe("news cleaning", () => {
  it("keeps only stories about Zcash", () => {
    const out = clean([
      { ...base, title: "Zcash rallies 12% as privacy coins rebound" },
      { ...base, link: "https://example.com/b", title: "Bitcoin hits a new high" },
      { ...base, link: "https://example.com/c", title: "Privacy coins surge", description: "ZEC led the move." },
      { ...base, link: "https://example.com/d", title: "Crypto wrap", coin: ["zec", "btc"] },
      { ...base, link: "https://example.com/e", title: "Mozec Inc posts results" }, // lowercase 'zec' inside a word
    ]);
    expect(out.map((a) => a.link)).toEqual(["https://example.com/a", "https://example.com/c", "https://example.com/d"]);
  });

  it("drops duplicates, unsafe links and missing dates; strips HTML", () => {
    const out = clean([
      { ...base, title: "Zcash <b>upgrade</b> ships", description: "<p>Zebra&nbsp;3 is out</p>" },
      { ...base, link: "https://other.com/x", title: "Zcash upgrade ships" }, // same headline elsewhere
      { ...base, link: "javascript:alert(1)", title: "Zcash news" },
      { ...base, link: "https://example.com/z", title: "Zcash news", pubDate: null },
      { ...base, link: "https://example.com/y", title: "Zcash dup", duplicate: true },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Zcash upgrade ships");
    expect(out[0].description).toBe("Zebra 3 is out");
  });

  it("sorts newest first and parses NewsData's UTC dates", () => {
    expect(parseDate("2026-11-26 09:30:00")).toBe("2026-11-26T09:30:00.000Z");
    const out = clean([
      { ...base, title: "Zcash older", pubDate: "2026-11-25 08:00:00" },
      { ...base, link: "https://example.com/n", title: "Zcash newer", pubDate: "2026-11-26 08:00:00" },
    ]);
    expect(out.map((a) => a.title)).toEqual(["Zcash newer", "Zcash older"]);
  });

  it("skips package indexes", () => {
    expect(clean([{ ...base, link: "https://pypi.org/project/cryptoetf/", title: "cryptoetf 1.1.1 ZEC" }])).toHaveLength(0);
  });

  it("only accepts https images", () => {
    const [a] = clean([{ ...base, title: "Zcash pic", image_url: "http://img.example.com/x.jpg", source_icon: "https://ex.com/i.png" }]);
    expect(a.imageUrl).toBeNull();
    expect(a.source.icon).toBe("https://ex.com/i.png");
  });
});

describe("topics", () => {
  it("classifies by headline first", () => {
    expect(topicOf("ZEC price jumps 15% in a day", null)).toBe("markets");
    expect(topicOf("Zcash network upgrade brings faster shielded sync", null)).toBe("tech");
    expect(topicOf("Zcash Foundation announces new grants", null)).toBe("ecosystem");
    expect(topicOf("Zcash explained", null)).toBe("general");
    expect(topicOf("Cypherpunk Reports 8,967 ZEC Mined as Zcash Treasury Nears 342,000 Tokens", null)).toBe("tech");
    expect(topicOf("Bitwise seeks Texas Stock Exchange listing for Zcash ETF", null)).toBe("markets");
  });
});
