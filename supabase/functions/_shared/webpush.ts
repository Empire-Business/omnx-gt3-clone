// ── Web Push (VAPID + RFC 8291/8188 aes128gcm) — módulo compartilhado ──
// Usado por send-chat-notification (push de chat) e send-push (push genérico
// de tarefa/feed). Mantém a criptografia do payload, sem a qual o FCM (Android)
// descarta a notificação e o iOS cai no texto genérico.

export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export type PushSubscriptionRow = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type PushResult = { ok: boolean; status: number; gone: boolean; error?: string };

function base64urlDecode(str: string): ArrayBuffer {
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function base64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function importVapidPrivateKey(privB64url: string, pubB64url: string): Promise<CryptoKey> {
  const pub = new Uint8Array(base64urlDecode(pubB64url));
  const x = base64urlEncode(pub.slice(1, 33).buffer as ArrayBuffer);
  const y = base64urlEncode(pub.slice(33, 65).buffer as ArrayBuffer);
  return await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", d: privB64url, x, y, key_ops: ["sign"] },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

async function buildVapidJWT(subject: string, audience: string, privKey: string, pubKey: string): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const payload = { aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject };
  const enc = new TextEncoder();
  const headerB64 = base64urlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64urlEncode(enc.encode(JSON.stringify(payload)));
  const sigInput = enc.encode(`${headerB64}.${payloadB64}`);
  const key = await importVapidPrivateKey(privKey, pubKey);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, sigInput);
  return `${headerB64}.${payloadB64}.${base64urlEncode(sig)}`;
}

function concatU8(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

async function encryptPayload(p256dhB64: string, authB64: string, plaintext: Uint8Array): Promise<Uint8Array> {
  const recipientPub = new Uint8Array(base64urlDecode(p256dhB64));
  const authSecret = new Uint8Array(base64urlDecode(authB64));
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const asKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"],
  ) as CryptoKeyPair;
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", asKeyPair.publicKey));

  const recipientPubKey = await crypto.subtle.importKey(
    "raw", recipientPub, { name: "ECDH", namedCurve: "P-256" }, false, [],
  );
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: recipientPubKey }, asKeyPair.privateKey, 256,
  );
  const ecdhSecret = new Uint8Array(sharedBits);

  const enc = new TextEncoder();
  const keyInfo = concatU8(enc.encode("WebPush: info\0"), recipientPub, asPublicRaw);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const record = concatU8(plaintext, new Uint8Array([0x02]));
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, record));

  const rs = new Uint8Array([0x00, 0x00, 0x10, 0x00]);
  const idlen = new Uint8Array([asPublicRaw.length]);
  return concatU8(salt, rs, idlen, asPublicRaw, ciphertext);
}

export async function sendWebPush(
  subscription: PushSubscriptionRow,
  payload: Record<string, unknown>,
  vapid: VapidConfig,
): Promise<PushResult> {
  let host = "?";
  try {
    const url = new URL(subscription.endpoint);
    host = url.host;
    const audience = `${url.protocol}//${url.host}`;
    const jwt = await buildVapidJWT(vapid.subject, audience, vapid.privateKey, vapid.publicKey);

    const headers: Record<string, string> = {
      "Authorization": `vapid t=${jwt},k=${vapid.publicKey}`,
      "TTL": "86400",
    };

    let bodyBuf: BodyInit | undefined;
    if (subscription.keys?.p256dh && subscription.keys?.auth) {
      const plaintext = new TextEncoder().encode(JSON.stringify(payload));
      const encrypted = await encryptPayload(subscription.keys.p256dh, subscription.keys.auth, plaintext);
      headers["Content-Encoding"] = "aes128gcm";
      headers["Content-Type"] = "application/octet-stream";
      headers["Urgency"] = "high";
      bodyBuf = encrypted;
    }

    const res = await fetch(subscription.endpoint, { method: "POST", headers, body: bodyBuf });
    const ok = res.ok || res.status === 201;
    // 404/410 = inscrição removida pelo navegador.
    // 403 = a assinatura VAPID não corresponde à applicationServerKey com que a
    // inscrição foi criada (chave antiga). O aparelho só se re-inscreve com a
    // chave nova quando abre o app; até lá a linha fica no banco falhando para
    // sempre. Tratar como morta é o certo — o app recria na próxima abertura.
    const gone = res.status === 404 || res.status === 410 || res.status === 403;
    if (!ok) {
      let respText = "";
      try { respText = (await res.text()).slice(0, 300); } catch { /* ignore */ }
      console.error(`[push] FALHA ${res.status} host=${host} body=${respText}`);
    }
    return { ok, status: res.status, gone };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[push] ERRO host=${host}: ${error}`);
    return { ok: false, status: 0, gone: false, error };
  }
}

/**
 * Envia o payload para uma lista de subscriptions, com log e coleta de endpoints
 * mortos (404/410/403) para limpeza pelo chamador.
 */
export async function pushToSubscriptions(
  subs: Array<{ endpoint: string; keys: { p256dh: string; auth: string } }>,
  payload: Record<string, unknown>,
  vapid: VapidConfig,
): Promise<{ sent: number; failed: number; deadEndpoints: string[]; results: Array<{ host: string; status: number; ok: boolean }> }> {
  let sent = 0;
  let failed = 0;
  const deadEndpoints: string[] = [];
  const results: Array<{ host: string; status: number; ok: boolean }> = [];

  for (const sub of subs) {
    const r = await sendWebPush({ endpoint: sub.endpoint, keys: sub.keys }, payload, vapid);
    let host = "?";
    try { host = new URL(sub.endpoint).host; } catch { /* ignore */ }
    results.push({ host, status: r.status, ok: r.ok });
    if (r.ok) sent++;
    else {
      failed++;
      if (r.gone) deadEndpoints.push(sub.endpoint);
    }
  }
  return { sent, failed, deadEndpoints, results };
}
