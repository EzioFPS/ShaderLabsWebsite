import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncReceived } from "@/lib/mailbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Checks Resend for mail the webhook may have missed, then returns when the newest message
 * arrived (ms). The inbox refreshes when that changes, so mail delivered by the webhook shows up too.
 * A route rather than a server action: server actions run one at a time, so a slow sync would
 * hold up taps on the inbox. ?force=1 skips the once-a-minute throttle.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  try {
    await syncReceived(new URL(req.url).searchParams.has("force"));
  } catch (err) {
    console.error("[mailbox] sync failed:", err);
  }
  const newest = await db.mailMessage.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  return Response.json({ newest: newest?.createdAt.getTime() ?? 0 });
}
