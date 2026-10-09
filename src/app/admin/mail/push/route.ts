import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyOne } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sub = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

// POST: save this device's push subscription. DELETE: remove it.
export async function POST(req: Request) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  const sub = (await req.json().catch(() => ({}))) as Sub;
  if (!sub.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) return new Response("Bad subscription", { status: 400 });
  const data = { p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null };
  await db.pushSubscription.upsert({ where: { endpoint: sub.endpoint }, update: data, create: { endpoint: sub.endpoint, ...data } });
  const delivered = await notifyOne(
    { endpoint: sub.endpoint, ...data },
    { title: "Notifications are on", body: "You'll get a notification here for every new email to mail@shaderlabs.in.", url: "/admin/mail", tag: "push-enabled" },
  );
  return Response.json({ ok: true, delivered });
}

export async function DELETE(req: Request) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  const { endpoint } = (await req.json().catch(() => ({}))) as Sub;
  if (endpoint) await db.pushSubscription.deleteMany({ where: { endpoint } });
  return Response.json({ ok: true });
}
