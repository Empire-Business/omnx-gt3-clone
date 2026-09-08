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
    // Resolvido SEMPRE pelo origin do próprio SW, nunca por URL absoluta vinda
    // do servidor: o payload dependia de SITE_URL, e com esse env apontando
    // para um domínio morto a imagem não carregava — o Android então desenhava
    // um círculo branco vazio no lugar do ícone.
    icon: `${origin}/favicon-omnx.png`,
    // Sem `badge` de propósito. O badge exige PNG MONOCROMÁTICO com alpha (o
    // Android o usa como máscara na barra de status); passar um ícone colorido
    // vira um borrão branco. Sem ele, o Chrome usa o ícone do próprio site.
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
  // Aceita tanto caminho relativo ("/chat/123", o formato atual) quanto URL
  // absoluta de payloads antigos, resolvendo sempre contra o origin do SW.
  const url = new URL(
    event.notification.data?.url || "/chat",
    self.location.origin
  ).href;
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
