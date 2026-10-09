import { isAdmin } from "@/lib/auth";
import { loadThread } from "@/lib/mailbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /admin/mail/thread?key=<threadKey>: one conversation as JSON, for the inbox to open
// instantly (and to preload on hover). Reading doesn't mark anything as read.
export async function GET(req: Request) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  const key = new URL(req.url).searchParams.get("key");
  if (!key) return new Response("Missing key", { status: 400 });
  const messages = await loadThread(key);
  return Response.json({ messages }, { headers: { "Cache-Control": "private, no-store" } });
}
