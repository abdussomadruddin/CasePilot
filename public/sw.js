// CasePilot release: 20261019-refresh-1
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Only discard CasePilot-owned caches, never authentication or browser storage.
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("casepilot-")).map((key) => caches.delete(key)));
    await self.clients.claim();
    const windows = await self.clients.matchAll({ type: "window" });
    for (const client of windows) client.postMessage({ type: "CASEPILOT_UPDATE_READY" });
  })());
});

self.addEventListener("push", (event) => {
  let data = {};

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = {};
    }
  }

  const title = data.title || "CasePilot alert";
  const options = {
    body: data.body || "A case needs attention. Open CasePilot to continue.",
    icon: "/icon-192.svg",
    badge: "/badge.svg",
    data: {
      url: data.url || "/",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          const navigated = await client.navigate(targetUrl);
          if (navigated) return navigated.focus();
        }
      }

      return self.clients.openWindow(targetUrl);
    }),
  );
});
