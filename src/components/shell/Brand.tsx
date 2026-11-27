import Image from "next/image";

/** Zorro's fox mark (transparent PNG from brand/zorro-logo.png) on a soft dark circle, like an avatar. */
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <span className="inline-grid shrink-0 place-items-center rounded-full bg-white/8 ring-1 ring-white/10" style={{ width: size, height: size }}>
      <Image src="/brand/zorro-fox.png" alt="" width={size} height={size} className="p-[8%]" priority />
    </span>
  );
}
