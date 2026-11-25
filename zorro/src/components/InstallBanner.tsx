"use client";

import { Smartphone, X } from "lucide-react";
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
    <aside className="panel mb-6 flex items-start gap-3 border-fox/40 bg-fox/5 p-4 text-sm">
      <Smartphone size={18} strokeWidth={1.7} className="mt-0.5 shrink-0 text-fox-light" aria-hidden="true" />
      <div className="flex-1">
        <p className="font-medium">Install Zorro</p>
        {mode === "ios" ? (
          <p className="mt-1 text-muted">
            Tap <span className="text-snow">Share</span>, then <span className="text-snow">Add to Home Screen</span>.
            iPhone only sends bot alerts to installed apps.
          </p>
        ) : (
          <p className="mt-1 text-muted">Add Zorro to your home screen to get stop-loss and DCA alerts.</p>
        )}
        {mode === "android" && promptEvent && (
          <button
            onClick={async () => {
              await promptEvent.prompt();
              setDismissed(true);
            }}
            className="btn-primary mt-3 min-h-10 px-4 text-[13px]"
          >
            Install
          </button>
        )}
      </div>
      <button onClick={dismiss} aria-label="Dismiss" className="-m-1 rounded-lg p-1 text-muted hover:text-snow">
        <X size={16} />
      </button>
    </aside>
  );
}
