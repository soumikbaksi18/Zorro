import Image from "next/image";
import Link from "next/link";

/** Fox mark + wordmark. `caption` shows the small monospace line under the name. */
export function Brand({ caption = false, size = 36 }: { caption?: boolean; size?: number }) {
  return (
    <Link href="/" className="flex items-center gap-3" aria-label="Zorro home">
      <Image src="/brand/zorro-mark.png" alt="" width={size} height={size} className="rounded-[10px]" priority />
      <span className="leading-none">
        <span className="block text-[20px] font-semibold tracking-[-0.04em]">Zorro</span>
        {caption && <span className="eyebrow mt-1.5 block text-[8px] tracking-[0.18em] whitespace-nowrap">Private ZEC bots</span>}
      </span>
    </Link>
  );
}
