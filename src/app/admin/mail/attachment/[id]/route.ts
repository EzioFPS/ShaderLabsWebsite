import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Raster image types that are safe to show inline (SVG is excluded: it can carry script).
const INLINE_IMAGE = /^image\/(png|jpe?g|gif|webp|avif|bmp)$/i;

// Downloads a stored attachment. Always as a download (never rendered inline on our origin),
// so a malicious HTML/SVG attachment can't run in the admin's session. The one exception is
// ?inline=1 for plain raster images embedded in an email body.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const a = await db.mailAttachment.findUnique({ where: { id } });
  if (!a) return new Response("Not found", { status: 404 });

  const inline = new URL(req.url).searchParams.has("inline") && INLINE_IMAGE.test(a.contentType);
  const safeName = a.filename.replace(/[\r\n"\\]/g, "_");
  return new Response(new Uint8Array(a.data), {
    headers: {
      "Content-Type": inline ? a.contentType : "application/octet-stream",
      "Content-Disposition": inline ? "inline" : `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
      "Content-Length": String(a.data.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": inline ? "private, max-age=86400, immutable" : "private, no-store",
    },
  });
}
