"use client";

import { useRef, useState } from "react";

// Renders an email's HTML in a sandboxed iframe: no scripts, no forms, links open in a new tab.
// allow-same-origin (without allow-scripts) only lets this page measure the height.
export function MailFrame({ html, title }: { html: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(240);

  const doc = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer"><base target="_blank">
<style>html,body{margin:0;background:#fff;color:#111}body{padding:20px;font:14px/1.55 Arial,Helvetica,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}</style>
</head><body>${html}</body></html>`;

  const fit = () => {
    const d = ref.current?.contentDocument;
    if (d?.body) setHeight(Math.min(Math.max(d.documentElement.scrollHeight, 120), 20000));
  };

  return (
    <iframe
      ref={ref}
      title={title}
      srcDoc={doc}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      onLoad={() => {
        fit();
        // Follow later size changes: images loading, or the message being unfolded.
        const root = ref.current?.contentDocument?.documentElement;
        if (root) new ResizeObserver(fit).observe(root);
      }}
      style={{ height }}
      className="block w-full rounded-md border border-line bg-white"
    />
  );
}
