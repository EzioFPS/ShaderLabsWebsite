"use client";

import { useEffect, useState } from "react";

// Phone-app bits for the mail inbox: registers the service worker, offers "Install app"
// (Android/desktop Chrome), and turns new-mail notifications on or off for this device.

type BeforeInstall = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on" | "working";

function keyBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function AppControls({ pushKey, compact = false }: { pushKey: string | null; compact?: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [install, setInstall] = useState<BeforeInstall | null>(null);
  const [tip, setTip] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as BeforeInstall);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator)) return setState("unsupported");
      const reg = await navigator.serviceWorker.register("/admin/mail-sw.js", { scope: "/admin/" }).catch(() => null);
      if (!pushKey || !("PushManager" in window) || !("Notification" in window)) return setState(ios && !standalone ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
      // Re-register quietly each time, so the server always has this phone's current address
      // (browsers rotate them now and then, and notifications would stop without a word).
      if (sub)
        fetch("/admin/mail/push?resync=1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) }).catch(() => {});
    })();
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [pushKey]);

  const enable = async () => {
    if (!pushKey) return;
    setState("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(pushKey) }));
      const res = await fetch("/admin/mail/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      setState(res.ok ? "on" : "off");
    } catch (err) {
      console.error("[push] enable failed", err);
      setState("off");
    }
  };

  const disable = async () => {
    setState("working");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/admin/mail/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    setState("off");
  };

  const btn = compact
    ? "inline-flex h-9 flex-none items-center gap-1.5 rounded-full border border-line-strong px-3 text-sm text-fg/85 hover:border-fg"
    : "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-fg/75 hover:bg-surface-2 hover:text-fg";
  const bell = (on: boolean) => (
    <svg viewBox="0 0 24 24" className={`h-4 w-4 flex-none ${on ? "text-lime" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15L6 16zM10 21h4" />
      {!on && <path d="M4 4l16 16" />}
    </svg>
  );

  return (
    <>
      {install && (
        <button
          type="button"
          className={btn}
          onClick={async () => {
            await install.prompt();
            setInstall(null);
          }}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" />
          </svg>
          Install app
        </button>
      )}
      {state === "on" && (
        <button type="button" className={btn} onClick={disable} title="Turn off new-mail notifications on this device">
          {bell(true)} Notifications on
        </button>
      )}
      {(state === "off" || state === "working") && (
        <button type="button" className={btn} onClick={enable} disabled={state === "working"}>
          {bell(false)} {state === "working" ? "Turning on…" : "Enable notifications"}
        </button>
      )}
      {state === "denied" && (
        <p className={compact ? "flex-none text-xs text-muted" : "px-2 py-1.5 text-xs text-muted"}>Notifications are blocked. Allow them in this browser&apos;s site settings.</p>
      )}
      {state === "ios-install" && (
        <>
          <button type="button" className={btn} onClick={() => setTip((t) => !t)}>
            {bell(false)} Get notifications
          </button>
          {tip && (
            <p className="w-full rounded-md border border-line-strong bg-surface p-3 text-xs leading-relaxed text-fg/85">
              On iPhone: tap <strong>Share</strong> → <strong>Add to Home Screen</strong>, then open <strong>SL Mail</strong> from your Home Screen and tap
              &quot;Enable notifications&quot; there.
            </p>
          )}
        </>
      )}
    </>
  );
}
