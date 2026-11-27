"use client";

import { useRef, useState } from "react";
import { ArrowRight, ChevronsRight } from "lucide-react";

/**
 * "Slide to pay": drag the lime knob to the end to confirm. Prevents accidental taps.
 * Keyboard users focus the control and press Enter (or Space) instead.
 */
export function SlideToConfirm({ label, onConfirm, disabled = false, busyLabel }: { label: string; onConfirm: () => void; disabled?: boolean; busyLabel?: string | null }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; max: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const KNOB = 56;

  const confirm = () => {
    if (disabled || busyLabel) return;
    onConfirm();
  };

  function down(e: React.PointerEvent) {
    if (disabled || busyLabel || !trackRef.current) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX - offset, max: trackRef.current.clientWidth - KNOB - 8 };
    setDragging(true);
  }
  function move(e: React.PointerEvent) {
    if (!start.current) return;
    setOffset(Math.max(0, Math.min(start.current.max, e.clientX - start.current.x)));
  }
  function up() {
    if (!start.current) return;
    const done = offset >= start.current.max * 0.85;
    start.current = null;
    setDragging(false);
    setOffset(done ? offset : 0);
    if (done) {
      confirm();
      setTimeout(() => setOffset(0), 600);
    }
  }

  return (
    <div
      ref={trackRef}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || Boolean(busyLabel)}
      aria-label={`${label}. Slide right or press Enter to confirm.`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          confirm();
        }
      }}
      className={`relative flex h-[72px] items-center rounded-full bg-[#1b241d] p-2 select-none ${disabled ? "opacity-45" : ""}`}
    >
      <div
        className="absolute inset-y-2 left-2 rounded-full bg-brand/25"
        style={{ width: offset + KNOB, transition: dragging ? "none" : "width 0.25s" }}
        aria-hidden="true"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="relative z-10 grid h-14 w-14 shrink-0 touch-none place-items-center rounded-full bg-brand text-brand-ink shadow-[0_6px_20px_-6px_rgba(184,243,107,0.7)]"
        style={{ transform: `translateX(${offset}px)`, transition: dragging ? "none" : "transform 0.25s" }}
      >
        <ArrowRight size={22} strokeWidth={2.2} />
      </button>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center pl-14 text-[15px] font-medium text-snow/90">{busyLabel ?? label}</span>
      <ChevronsRight size={20} className="pointer-events-none absolute right-6 text-snow/40" aria-hidden="true" />
    </div>
  );
}
