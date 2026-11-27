"use client";

// Small shared UI pieces.

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked; the value is still visible to copy by hand */
        }
      }}
      className="shrink-0 rounded-full border border-line-strong px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] text-snow/90 uppercase hover:border-brand-light"
    >
      {copied ? "Copied" : label}
    </button>
  );
}

export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { margin: 1, width: size * 2, errorCorrectionLevel: "M" })
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setSrc(null));
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <div className="rounded-2xl bg-white p-3" style={{ width: size + 24, height: size + 24 }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL, nothing for next/image to optimise
        <img src={src} alt="Payment QR code" width={size} height={size} />
      ) : (
        <div className="h-full w-full animate-pulse rounded-lg bg-black/10" />
      )}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="flex rounded-full border border-line bg-panel p-1" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`min-h-10 flex-1 rounded-full text-sm font-medium transition-colors ${
            value === o.value ? "bg-brand text-brand-ink" : "text-muted hover:text-snow"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-2xl border border-down/40 bg-down/10 px-4 py-3 text-sm text-down">
      {message}
    </p>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand" aria-hidden="true" />
      {label}
    </span>
  );
}
