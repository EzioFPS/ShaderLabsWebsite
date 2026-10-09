import "server-only";
import webpush from "web-push";
import { db } from "@/lib/db";

// Web Push for the mail app: a notification in the phone's notification panel for each new email.
// Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (generated once, kept in env).

export const pushConfigured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? "";

let ready = false;
function setup() {
  if (ready || !pushConfigured()) return ready;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:mail@shaderlabs.in", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  ready = true;
  return ready;
}

export type PushMessage = { title: string; body: string; url: string; tag?: string };

/** Sends to one device (used to confirm notifications work right after enabling them). */
export async function notifyOne(sub: { endpoint: string; p256dh: string; auth: string }, message: PushMessage) {
  if (!setup()) return false;
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(message), { TTL: 600, urgency: "high" });
    return true;
  } catch (err) {
    console.error("[push] confirmation failed:", (err as { statusCode?: number }).statusCode, (err as Error).message);
    return false;
  }
}

/** Sends to every subscribed device; drops subscriptions the push service says are gone. */
export async function notifyAll(message: PushMessage) {
  if (!setup()) return;
  const subs = await db.pushSubscription.findMany();
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(message), {
          TTL: 24 * 3600,
          urgency: "high",
        });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else console.error("[push] send failed:", status, (err as Error).message);
      }
    }),
  );
}
