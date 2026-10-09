import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Downloads a stored attachment. Always as a download (never rendered inline on our origin),
// so a malicious HTML/SVG attachment can't run in the admin's session.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const a = await db.mailAttachment.findUnique({ where: { id } });
  if (!a) return new Response("Not found", { status: 404 });

  const safeName = a.filename.replace(/[\r\n"\\]/g, "_");
  return new Response(new Uint8Array(a.data), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
      "Content-Length": String(a.data.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
