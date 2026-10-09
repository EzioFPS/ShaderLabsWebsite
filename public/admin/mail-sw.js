// Shader Labs Mail: service worker for the installed app.
// Shows a notification for each new email (Web Push) and opens that conversation when tapped.
// Scope: /admin/ (registered from the mail page).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// ---------- page loads: ride out network blips ----------
// A phone that has just woken up (e.g. from a notification) often switches networks mid-request,
// which Chrome reports as "connection interrupted". Page loads are retried a few times; if the
// network is really gone, a small screen waits for it and reloads by itself. Nothing is cached:
// the inbox always comes fresh from the server.

const RETRY_DELAYS = [400, 1200, 2500];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(request) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(request);
    } catch (err) {
      if (attempt >= RETRY_DELAYS.length) throw err;
      await wait(RETRY_DELAYS[attempt]);
    }
  }
}

const OFFLINE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#0b0b0a"><title>Reconnecting…</title>
<style>html,body{height:100%;margin:0;background:#0b0b0a;color:#ededE8;font:15px/1.5 system-ui,-apple-system,sans-serif}body{display:grid;place-items:center;text-align:center;padding:24px;box-sizing:border-box}p{margin:.25rem 0}.m{color:#8c8c85;font-size:13px}.d{width:8px;height:8px;border-radius:50%;background:#c6ff3d;margin:0 auto 16px;animation:b 1.2s ease-in-out infinite}@keyframes b{50%{opacity:.25}}button{margin-top:18px;background:#ededE8;color:#0b0b0a;border:0;border-radius:999px;padding:10px 20px;font:inherit;font-weight:600}</style></head>
<body><div><div class="d"></div><p>Reconnecting…</p><p class="m">Waiting for the network. This page reloads by itself.</p><button onclick="location.reload()">Try again</button></div>
<script>addEventListener("online",()=>location.reload());setInterval(()=>{if(navigator.onLine)location.reload()},4000)</script></body></html>`;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate" || req.method !== "GET") return; // everything else goes straight to the network
  event.respondWith(
    fetchWithRetry(req).catch(
      () => new Response(OFFLINE_PAGE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }),
    ),
  );
});

// ---------- notifications ----------

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "New email", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "New email";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/admin/mail-icon-192.png",
      badge: "/admin/mail-badge-96.png",
      tag: data.tag || undefined, // one notification per conversation, updated as replies come in
      renotify: Boolean(data.tag),
      timestamp: Date.now(),
      data: { url: data.url || "/admin/mail", thread: data.tag || null },
    }),
  );
});

// Asks an open inbox to show the conversation itself (no page reload); resolves false if it doesn't answer.
function askInbox(client, thread) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), 1500);
    channel.port1.onmessage = () => {
      clearTimeout(timer);
      resolve(true);
    };
    client.postMessage({ type: "open-thread", thread }, [channel.port2]);
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { url: path = "/admin/mail", thread = null } = event.notification.data || {};
  const url = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const client = windows.find((c) => new URL(c.url).pathname.startsWith("/admin"));
      if (!client) return void (await self.clients.openWindow(url));
      await client.focus().catch(() => {});
      const onInbox = new URL(client.url).pathname === "/admin/mail";
      if (onInbox && thread && (await askInbox(client, thread))) return;
      if ("navigate" in client) await client.navigate(url).catch(() => self.clients.openWindow(url));
      else await self.clients.openWindow(url);
    })(),
  );
});
