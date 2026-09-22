self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = typeof payload.title === "string" ? payload.title : "Arcadia check-in";
  const options = {
    body: typeof payload.body === "string" ? payload.body : "Open Arcadia to check in.",
    tag: typeof payload.tag === "string" ? payload.tag : "arcadia-check-in",
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: { link: typeof payload.link === "string" ? payload.link : "/app" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data && event.notification.data.link ? event.notification.data.link : "/app";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) return existing.navigate(link).then((client) => client && client.focus());
      return clients.openWindow(link);
    }),
  );
});
