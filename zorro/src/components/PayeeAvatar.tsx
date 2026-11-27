import { CoinBadge } from "./money";

/** Contact-style avatar: initials on a warm circle, with the coin they receive in the corner. */
export function PayeeAvatar({ name, coinKey, size = 48 }: { name: string; coinKey: string; size?: number }) {
  const initials =
    name
      .replace(/^@/, "")
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";
  return (
    <span className="relative inline-grid shrink-0" style={{ width: size, height: size }}>
      <span
        className="grid place-items-center rounded-full bg-gradient-to-br from-[#3a3220] to-[#211d13] font-semibold text-zec-light"
        style={{ width: size, height: size, fontSize: size * 0.36 }}
        aria-hidden="true"
      >
        {initials}
      </span>
      <span className="absolute -right-0.5 -bottom-0.5 rounded-full ring-2 ring-ink">
        <CoinBadge coinKey={coinKey} size={Math.round(size * 0.4)} />
      </span>
    </span>
  );
}
