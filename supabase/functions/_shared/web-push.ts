type Role =
  | "admin"
  | "customer_service"
  | "finance"
  | "caller"
  | "operator"
  | "sales_manager";

type PushSubscriptionRow = {
  id: string;
  role: Role;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type PushResult = {
  sent: number;
  failed: number;
  skipped?: string;
  error?: string;
};

type PushPayload = {
  title?: string;
  body?: string;
  url?: string;
};

const encoder = new TextEncoder();

function base64UrlToBytes(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function bytesToBase64Url(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";

  for (const byte of view) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function stringToBase64Url(value: string) {
  return bytesToBase64Url(encoder.encode(value));
}

function concatBytes(...chunks: Uint8Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}

function uint32Bytes(value: number) {
  return new Uint8Array([
    (value >> 24) & 255,
    (value >> 16) & 255,
    (value >> 8) & 255,
    value & 255,
  ]);
}

async function hmacSha256(keyBytes: Uint8Array, data: Uint8Array) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  return new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
}

async function hkdfExpand(
  pseudoRandomKey: Uint8Array,
  info: Uint8Array,
  length: number,
) {
  const output = new Uint8Array(length);
  let previous = new Uint8Array(0);
  let offset = 0;
  let counter = 1;

  while (offset < length) {
    previous = await hmacSha256(
      pseudoRandomKey,
      concatBytes(previous, info, new Uint8Array([counter])),
    );
    output.set(previous.slice(0, Math.min(previous.length, length - offset)), offset);
    offset += previous.length;
    counter += 1;
  }

  return output;
}

async function createVapidJwt(audience: string) {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";

  if (!publicKey || !privateKey) {
    throw new Error("Missing VAPID keys");
  }

  const publicKeyBytes = base64UrlToBytes(publicKey);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: bytesToBase64Url(publicKeyBytes.slice(1, 33)),
    y: bytesToBase64Url(publicKeyBytes.slice(33, 65)),
    d: privateKey,
    ext: false,
  };
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const header = stringToBase64Url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = stringToBase64Url(
    JSON.stringify({
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
      sub: subject,
    }),
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    encoder.encode(`${header}.${body}`),
  );

  return `${header}.${body}.${bytesToBase64Url(signature)}`;
}

async function encryptPayload(subscription: PushSubscriptionRow, payload: PushPayload) {
  const receiverPublicKeyBytes = base64UrlToBytes(subscription.p256dh);
  const authSecret = base64UrlToBytes(subscription.auth);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const senderKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const receiverPublicKey = await crypto.subtle.importKey(
    "raw",
    receiverPublicKeyBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: receiverPublicKey },
      senderKeyPair.privateKey,
      256,
    ),
  );
  const senderPublicKeyBytes = new Uint8Array(
    await crypto.subtle.exportKey("raw", senderKeyPair.publicKey),
  );
  const keyInfo = concatBytes(
    encoder.encode("WebPush: info\0"),
    receiverPublicKeyBytes,
    senderPublicKeyBytes,
  );
  const prkKey = await hmacSha256(authSecret, sharedSecret);
  const ikm = await hkdfExpand(prkKey, keyInfo, 32);
  const prk = await hmacSha256(salt, ikm);
  const cek = await hkdfExpand(
    prk,
    encoder.encode("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = await hkdfExpand(
    prk,
    encoder.encode("Content-Encoding: nonce\0"),
    12,
  );
  const aesKey = await crypto.subtle.importKey(
    "raw",
    cek,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const plaintext = concatBytes(
    encoder.encode(JSON.stringify(payload)),
    new Uint8Array([2]),
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext),
  );

  return concatBytes(
    salt,
    uint32Bytes(4096),
    new Uint8Array([senderPublicKeyBytes.length]),
    senderPublicKeyBytes,
    ciphertext,
  );
}

async function sendWebPush(subscription: PushSubscriptionRow, payload?: PushPayload) {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");

  if (!publicKey || !privateKey) {
    throw new Error("Missing VAPID keys");
  }

  const endpointUrl = new URL(subscription.endpoint);
  const jwt = await createVapidJwt(endpointUrl.origin);
  const body = payload ? await encryptPayload(subscription, payload) : undefined;

  return fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${publicKey}`,
      "Crypto-Key": `p256ecdsa=${publicKey}`,
      TTL: "43200",
      Urgency: "normal",
      ...(body
        ? {
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
          }
        : {}),
    },
    body,
  });
}

export async function sendPushesForRoles(
  supabase: any,
  roles: Role[],
  payloadsByRole: Partial<Record<Role, PushPayload>> = {},
): Promise<PushResult> {
  const uniqueRoles = [...new Set(roles)];

  if (!uniqueRoles.length) return { sent: 0, failed: 0 };

  if (!Deno.env.get("VAPID_PUBLIC_KEY") || !Deno.env.get("VAPID_PRIVATE_KEY")) {
    return { sent: 0, failed: 0, skipped: "missing_vapid_secrets" };
  }

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id,role,endpoint,p256dh,auth")
    .eq("active", true)
    .in("role", uniqueRoles);

  if (error) {
    return { sent: 0, failed: 0, error: error.message };
  }

  let sent = 0;
  let failed = 0;

  for (const subscription of (data || []) as PushSubscriptionRow[]) {
    try {
      const response = await sendWebPush(
        subscription,
        payloadsByRole[subscription.role],
      );

      if (response.ok || response.status === 201 || response.status === 202) {
        sent += 1;
        await supabase
          .from("push_subscriptions")
          .update({ last_seen_at: new Date().toISOString(), last_error: null })
          .eq("id", subscription.id);
      } else {
        failed += 1;
        await supabase
          .from("push_subscriptions")
          .update({
            active: response.status === 404 || response.status === 410 ? false : true,
            last_error: `${response.status} ${response.statusText}`,
          })
          .eq("id", subscription.id);
      }
    } catch (caught) {
      failed += 1;
      await supabase
        .from("push_subscriptions")
        .update({
          last_error: caught instanceof Error ? caught.message : "Unknown push error",
        })
        .eq("id", subscription.id);
    }
  }

  return { sent, failed };
}
