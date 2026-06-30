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
};

type PushResult = {
  sent: number;
  failed: number;
  skipped?: string;
  error?: string;
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

async function sendWebPush(endpoint: string) {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");

  if (!publicKey || !privateKey) {
    throw new Error("Missing VAPID keys");
  }

  const endpointUrl = new URL(endpoint);
  const jwt = await createVapidJwt(endpointUrl.origin);

  return fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${publicKey}`,
      "Crypto-Key": `p256ecdsa=${publicKey}`,
      TTL: "43200",
      Urgency: "normal",
    },
  });
}

export async function sendPushesForRoles(
  supabase: any,
  roles: Role[],
): Promise<PushResult> {
  const uniqueRoles = [...new Set(roles)];

  if (!uniqueRoles.length) return { sent: 0, failed: 0 };

  if (!Deno.env.get("VAPID_PUBLIC_KEY") || !Deno.env.get("VAPID_PRIVATE_KEY")) {
    return { sent: 0, failed: 0, skipped: "missing_vapid_secrets" };
  }

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id,role,endpoint")
    .eq("active", true)
    .in("role", uniqueRoles);

  if (error) {
    return { sent: 0, failed: 0, error: error.message };
  }

  let sent = 0;
  let failed = 0;

  for (const subscription of (data || []) as PushSubscriptionRow[]) {
    try {
      const response = await sendWebPush(subscription.endpoint);

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
