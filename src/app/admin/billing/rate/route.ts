import { isAdmin } from "@/lib/auth";
import { liveRate, rateHistory } from "@/lib/billing";
import { xflowConfigured } from "@/lib/xflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Xflow's live USD→INR rate for the rate card (polled every 30 seconds while it's on screen).
export async function GET() {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  if (!xflowConfigured()) return Response.json({ quote: null, history: [] });
  const [quote, history] = await Promise.all([liveRate(), rateHistory()]);
  return Response.json({ quote, history, at: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
