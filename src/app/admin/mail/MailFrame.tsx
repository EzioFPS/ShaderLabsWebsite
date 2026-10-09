"use client";

import { useEffect, useRef } from "react";

// Renders an email's HTML in a sandboxed iframe: no scripts, no forms, links open in a new tab.
// allow-same-origin (without allow-scripts) only lets this page measure the content height,
// so the whole email shows at full length with no inner scrollbar.
export function MailFrame({ html, title }: { html: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);

  const doc = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer"><base target="_blank">
<style>
html,body{margin:0;background:#fff;color:#1a1a1a;height:auto!important;min-height:0!important;overflow-y:hidden!important}
body{padding:28px 32px;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;overflow-wrap:anywhere;overflow-x:auto}
img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}a{color:#0b57d0}
blockquote{margin:12px 0;padding-left:12px;border-left:3px solid #ddd;color:#555}
@media (max-width:600px){body{padding:18px 16px}}
</style></head><body>${html}</body></html>`;

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let observer: ResizeObserver | null = null;
    let watched: HTMLElement | null = null;

    const fit = () => {
      const d = frame.contentDocument;
      // Only measure the email itself, not the blank page an iframe starts with.
      if (!d?.body || d.URL !== "about:srcdoc") return false;
      // Collapse first: templates sized "100% of the window" then report their real content height.
      frame.style.height = "0px";
      const h = Math.max(d.body.scrollHeight, d.documentElement.scrollHeight);
      frame.style.height = `${Math.min(Math.max(h, 60), 40000)}px`;
      if (watched !== d.body) {
        observer?.disconnect();
        observer = new ResizeObserver(() => fit()); // images loading, fonts, window resizes
        observer.observe(d.body);
        watched = d.body;
      }
      return true;
    };

    frame.addEventListener("load", fit);
    // The email may finish loading before this effect runs; keep trying briefly until it's measured.
    let tries = 0;
    const timer = setInterval(() => {
      if (fit() || ++tries > 40) clearInterval(timer);
    }, 50);
    return () => {
      clearInterval(timer);
      frame.removeEventListener("load", fit);
      observer?.disconnect();
    };
  }, [html]);

  return (
    <iframe
      ref={ref}
      title={title}
      srcDoc={doc}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      style={{ height: 200 }}
      className="block w-full rounded-lg bg-white"
    />
  );
}
