// Shader Labs Mail: service worker for the installed app.
// Shows a notification for each new email (Web Push) and opens that conversation when tapped.
// Scope: /admin/mail (registered from the mail page).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Network only: the inbox always needs fresh data. Having a fetch handler keeps the app installable.
self.addEventListener("fetch", () => {});

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
      data: { url: data.url || "/admin/mail" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/admin/mail", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).pathname.startsWith("/admin/mail") && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
