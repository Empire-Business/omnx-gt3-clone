// Service Worker — GT3 Chat Push Notifications

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try { payload = event.data.json(); } catch { /* dado não-JSON, ignora */ }
  }

  const origin = self.location.origin;
  const title = payload.title || "GT3 — Nova mensagem no chat";
  const options = {
    body: payload.body || "Você recebeu uma nova mensagem.",
    icon: payload.icon || `${origin}/logo.png`,
    badge: `${origin}/logo.png`,
    tag: payload.tag || "chat",
    data: payload.data || { url: "/chat" },
    vibrate: [200, 100, 200],
    renotify: true,
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Android/Chrome (FCM) rotacionam/invalidam a PushSubscription periodicamente,
// disparando este evento. Sem tratá-lo, a inscrição salva no banco "morre" e o
// push para de chegar silenciosamente (sintoma clássico: iOS continua, Android não).
// Re-inscrevemos imediatamente reaproveitando a applicationServerKey antiga, para
// não ficar sem push até o app reabrir (o app re-salva a inscrição ao voltar ao
// foreground — ver usePushNotifications).
self.addEventListener("pushsubscriptionchange", (event) => {
  const oldSub = event.oldSubscription;
  const appServerKey =
    oldSub && oldSub.options ? oldSub.options.applicationServerKey : undefined;
  if (!appServerKey) return;
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey })
      .catch(() => {})
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/chat";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.focus();
            client.navigate(url);
            return;
          }
        }
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});
