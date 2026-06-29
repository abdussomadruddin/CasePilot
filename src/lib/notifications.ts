import { getSupabaseClient } from "@/lib/supabase";
import type { CaseStatus, Profile, Role } from "@/lib/types";

const defaultVapidPublicKey =
  "BFHgf8Ul-0bLUtLTsevpPg-8gwxLC9u-t5VC3dHpBLzoYHMYr7z68ozqSBMl37WjSbaKhhm3CiqR-s_FdjIVvO4";

type PushAlertState =
  | "unsupported"
  | "default"
  | "granted"
  | "denied";

type StatusNotificationInput = {
  caseId: string;
  status: CaseStatus;
  roles: Role[];
  reason: string;
};

export function isNotificationSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export function getNotificationPermission(): PushAlertState {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.permission;
}

function base64UrlToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }

  return output;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null | undefined) {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return window.btoa(binary);
}

export async function enablePushNotifications(profile: Profile) {
  if (!isNotificationSupported()) {
    throw new Error("Push alerts are not supported on this browser.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  const existingSubscription = await registration.pushManager.getSubscription();
  const vapidPublicKey =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || defaultVapidPublicKey;
  const subscription =
    existingSubscription ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(vapidPublicKey),
    }));

  const keys = subscription.toJSON().keys;

  if (!keys?.p256dh || !keys.auth) {
    throw new Error("Unable to read browser push keys.");
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: profile.id,
      role: profile.role,
      endpoint: subscription.endpoint,
      p256dh: keys.p256dh || arrayBufferToBase64(subscription.getKey("p256dh")),
      auth: keys.auth || arrayBufferToBase64(subscription.getKey("auth")),
      user_agent: navigator.userAgent,
      active: true,
      last_seen_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: "endpoint" },
  );

  if (error) throw error;

  return subscription;
}

export async function notifyCaseStatusChange(input: StatusNotificationInput) {
  if (!input.roles.length) return true;

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.functions.invoke("send-push-notifications", {
      body: input,
    });

    if (error) {
      console.warn("Unable to invoke push notification function", error.message);
      return false;
    }

    return true;
  } catch (caught) {
    console.warn("Unable to invoke push notification function", caught);
    return false;
  }
}
