// Scheduled (every 15 minutes): saves Xflow's USD→INR rate for the Billing rate chart, so the
// chart keeps filling in while nobody has Billing open.
// Kept tiny on purpose (Netlify bills function time): one Xflow request and one SQL statement over
// Neon's HTTP endpoint, no Prisma and no call into the website.

const XFLOW = "https://api.xflowpay.com";

async function quote() {
  const url = new URL("/v1/quotes", XFLOW);
  for (const [k, v] of Object.entries({ "sell.currency": "USD", "sell.amount": "1.00", "buy.currency": "INR", type: "payout_fx" })) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.XFLOW_API_KEY}` }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Xflow ${res.status}`);
  const q = await res.json();
  const rate = Number(q.rate?.user);
  const midMarket = Number(q.rate?.mid_market) || rate;
  if (!(rate > 0)) throw new Error("no rate in quote");
  return { rate, midMarket };
}

/** One statement over Neon's SQL-over-HTTP endpoint (the same one Neon's serverless driver uses). */
async function sql(query, params) {
  const conn = process.env.DATABASE_URL;
  const host = new URL(conn).hostname;
  const res = await fetch(`https://${host}/sql`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Neon-Connection-String": conn },
    body: JSON.stringify({ query, params }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Neon ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export default async () => {
  if (!process.env.XFLOW_API_KEY || !process.env.DATABASE_URL) return new Response("not configured", { status: 200 });
  try {
    const { rate, midMarket } = await quote();
    // Skipped if Billing itself saved a reading in the last 10 minutes.
    const r = await sql(
      `INSERT INTO "FxSample" ("id", "at", "midMarket", "rate")
       SELECT $1, now(), $2, $3
       WHERE NOT EXISTS (SELECT 1 FROM "FxSample" WHERE "at" > now() - interval '10 minutes')`,
      [`fx_${crypto.randomUUID()}`, midMarket, rate],
    );
    return new Response(`saved ${r.rowCount ?? 0}`, { status: 200 });
  } catch (err) {
    console.error("[fx-sample]", err);
    return new Response("failed", { status: 500 });
  }
};

export const config = { schedule: "*/15 * * * *" };
