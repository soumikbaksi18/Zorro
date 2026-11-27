"use client";

import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";

/** True once the element has scrolled into view (stays true). */
export function useInView<T extends Element>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, shown };
}

/** Fades, lifts and un-blurs its children when scrolled into view. `delay` staggers siblings. */
export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  as?: ElementType;
  className?: string;
}) {
  const { ref, shown } = useInView<HTMLElement>();
  return (
    <Tag ref={ref} data-shown={shown} className={`reveal ${className}`} style={{ "--d": `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}

/** Counts from 0 to `to` (ease-out) once visible. */
export function CountUp({ to, decimals = 0, prefix = "", suffix = "", duration = 1400 }: { to: number; decimals?: number; prefix?: string; suffix?: string; duration?: number }) {
  const { ref, shown } = useInView<HTMLSpanElement>(0.5);
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!shown) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setValue(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shown, to, duration]);
  return (
    <span ref={ref} className="tabular">
      {prefix}
      {value.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

/** Types `text` out letter by letter once visible, then holds, clears and repeats. */
export function Typewriter({ text, speed = 55 }: { text: string; speed?: number }) {
  const { ref, shown } = useInView<HTMLSpanElement>(0.5);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!shown) return;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      i = i > text.length + 25 ? 0 : i + 1; // type, hold ~25 ticks, restart
      setN(Math.min(i, text.length));
      timer = setTimeout(step, speed);
    };
    timer = setTimeout(step, speed);
    return () => clearTimeout(timer);
  }, [shown, text, speed]);
  return (
    <span ref={ref} aria-label={text}>
      <span aria-hidden="true">{text.slice(0, n)}</span>
      <span aria-hidden="true" className="anim-caret ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-brand" />
    </span>
  );
}
