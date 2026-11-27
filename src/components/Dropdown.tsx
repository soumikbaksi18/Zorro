"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

export type DropdownOption<T extends string | number> = { value: T; label: string; hint?: string; icon?: ReactNode };

/**
 * A compact select: a small box that opens a frosted, scrollable list.
 * Opens upward when there's no room below. Keyboard: ↑ ↓ Home End to move, Enter to pick, Esc to close.
 * `variant="light"` is for use on the light lime sheet.
 */
export function Dropdown<T extends string | number>({
  value,
  onChange,
  options,
  label,
  variant = "dark",
  className = "",
  maxHeight = 224,
}: {
  value: T;
  onChange: (v: T) => void;
  options: DropdownOption<T>[];
  label: string;
  variant?: "dark" | "light";
  className?: string;
  maxHeight?: number;
}) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [active, setActive] = useState(0);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options[selectedIndex];

  function openList() {
    const rect = buttonRef.current?.getBoundingClientRect();
    // Leave room for the floating tab bar (~100px) when deciding to open upward.
    setUp(rect ? window.innerHeight - rect.bottom < maxHeight + 110 && rect.top > maxHeight + 20 : false);
    setActive(selectedIndex);
    setOpen(true);
  }
  function close(focusButton = true) {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  }
  function pick(i: number) {
    onChange(options[i].value);
    close();
  }

  // While open: close on outside tap, focus the list, and keep the active option in view.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    listRef.current?.focus();
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function onListKey(e: React.KeyboardEvent) {
    const last = options.length - 1;
    if (e.key === "ArrowDown") setActive((a) => Math.min(last, a + 1));
    else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(last);
    else if (e.key === "Enter" || e.key === " ") pick(active);
    else if (e.key === "Escape" || e.key === "Tab") return close(e.key === "Escape");
    else return;
    e.preventDefault();
  }

  const light = variant === "light";
  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={`${label}: ${selected?.label ?? ""}`}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            openList();
          }
        }}
        className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
          light
            ? `sheet-pill hover:shadow-[0_8px_18px_-8px_rgba(11,22,7,0.45)] ${open ? "ring-2 ring-brand-dark/40" : ""}`
            : `glass text-snow hover:bg-white/10 ${open ? "border-brand/60" : ""}`
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.icon}
          <span className="truncate">{selected?.label}</span>
        </span>
        <ChevronDown size={15} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""} ${light ? "text-brand-ink/60" : "text-snow/60"}`} aria-hidden="true" />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={`${id}-list`}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${id}-opt-${active}`}
          onKeyDown={onListKey}
          style={{ maxHeight }}
          className={`no-scrollbar absolute z-40 min-w-full overflow-y-auto overscroll-contain rounded-2xl p-1.5 outline-none ${up ? "bottom-full mb-2" : "top-full mt-2"} ${
            light
              ? "border border-white/70 bg-white/90 text-brand-ink shadow-[0_18px_40px_-16px_rgba(11,22,7,0.45)] backdrop-blur-xl"
              : "border border-white/12 bg-[#141c16]/90 text-snow shadow-[0_18px_40px_-14px_rgba(0,0,0,0.85)] backdrop-blur-xl"
          }`}
        >
          {options.map((o, i) => {
            const isSelected = o.value === value;
            return (
              <li
                key={String(o.value)}
                id={`${id}-opt-${i}`}
                data-index={i}
                role="option"
                aria-selected={isSelected}
                onPointerEnter={() => setActive(i)}
                onClick={() => pick(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm whitespace-nowrap ${
                  isSelected ? "bg-brand font-semibold text-brand-ink" : i === active ? (light ? "bg-brand-ink/8" : "bg-white/10") : ""
                }`}
              >
                <span className="flex items-center gap-2">
                  {o.icon}
                  {o.label}
                  {o.hint && <span className={`ml-2 text-xs ${isSelected ? "text-brand-ink/60" : "opacity-50"}`}>{o.hint}</span>}
                </span>
                {isSelected && <Check size={14} aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
