"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> };

const DISMISS_KEY = "zorro.installDismissed";

/** Nudges phone users to add Zorro to the home screen (needed for push on iPhone). */
function readPlatform(): "hidden" | "ios" | "other" {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone || localStorage.getItem(DISMISS_KEY)) return "hidden";
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ? "ios" : "other";
}

const noSubscribe = () => () => {};

export function InstallBanner() {
  const platform = useSyncExternalStore(noSubscribe, readPlatform, () => "hidden" as const);
  const [dismissed, setDismissed] = useState(false);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  // Chrome/Android fire this event when the app can be installed.
  useEffect(() => {
    if (platform !== "other") return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [platform]);

  const mode =
    dismissed || platform === "hidden" ? "hidden" : platform === "ios" ? "ios" : promptEvent ? "android" : "hidden";
  if (mode === "hidden") return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <aside className="flex items-start gap-3 rounded-2xl border border-gold/30 bg-gold/10 p-4 text-sm">
      <div className="flex-1">
        <p className="font-medium text-gold">Install Zorro</p>
        {mode === "ios" ? (
          <p className="mt-1 text-snow/80">
            Tap <span className="font-medium">Share</span>, then{" "}
            <span className="font-medium">Add to Home Screen</span>. iPhone only sends price alerts to installed apps.
          </p>
        ) : (
          <p className="mt-1 text-snow/80">Add Zorro to your home screen to get stop-loss and DCA alerts.</p>
        )}
        {mode === "android" && promptEvent && (
          <button
            onClick={async () => {
              await promptEvent.prompt();
              setDismissed(true);
            }}
            className="mt-3 rounded-xl bg-gold px-4 py-2 font-medium text-ink"
          >
            Install
          </button>
        )}
      </div>
      <button onClick={dismiss} aria-label="Dismiss" className="p-1 text-muted hover:text-snow">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
        </svg>
      </button>
    </aside>
  );
}
