import { isAdmin } from "@/lib/auth";
import { getSettings, invoicePdf, receivingAccount } from "@/lib/billing";
import { db } from "@/lib/db";
import { xflowFileContents } from "@/lib/xflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The invoice PDF: generated for invoices made here; the original Xflow document for imported ones.
// ?download=1 saves it instead of showing it.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const inv = await db.invoice.findUnique({ where: { id } });
  if (!inv) return new Response("Not found", { status: 404 });

  let bytes: Uint8Array;
  let type = "application/pdf";
  try {
    if (inv.source === "xflow" && inv.xflowFileId) {
      ({ bytes, type } = await xflowFileContents(inv.xflowFileId));
    } else {
      const [settings, bank] = await Promise.all([getSettings(), receivingAccount(inv.clientAccountId)]);
      bytes = new Uint8Array(await invoicePdf(inv, settings, bank));
    }
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Couldn't build the PDF", { status: 502 });
  }

  const name = `${inv.number.replace(/[^A-Za-z0-9-]+/g, "-")}.${type.includes("png") ? "png" : type.includes("jpeg") ? "jpg" : "pdf"}`;
  const download = new URL(req.url).searchParams.has("download");
  return new Response(new Uint8Array(bytes), {
    headers: {
      // Only PDFs/images are ever served here, so showing them inline is safe.
      "Content-Type": /^(application\/pdf|image\/(png|jpeg))$/.test(type) ? type : "application/octet-stream",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
