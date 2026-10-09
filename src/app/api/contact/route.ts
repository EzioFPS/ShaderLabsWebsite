import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEnquiryEmail } from "@/lib/mail";
import { rateLimit } from "@/lib/rate-limit";
import { enquirySchema } from "@/lib/validation";

export const runtime = "nodejs";

const MIN_FILL_MS = 2500; // humans don't fill a form in under 2.5s

// Netlify sets x-nf-client-connection-ip itself; visitors can't fake it the way they could other headers.
function clientIp(req: Request) {
  return (req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim();
}

const TOO_MANY = { ok: false, error: "Too many messages from your connection. Please try again in a few minutes." };
const FAILED = { ok: false, error: "Something went wrong. Please try again, or email us directly." };

export async function POST(req: Request) {
  const ip = clientIp(req);

  if (!rateLimit(`contact:${ip}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json(TOO_MANY, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const parsed = enquirySchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return NextResponse.json(
      { ok: false, error: "Please check the highlighted fields.", fieldErrors },
      { status: 422 },
    );
  }

  const data = parsed.data;

  // Bots: pretend success so they don't retry, but store nothing.
  const tooFast = data.fillMs !== undefined && data.fillMs < MIN_FILL_MS;
  if (data.fax || tooFast) {
    return NextResponse.json({ ok: true });
  }

  // The in-memory limit above resets whenever Netlify starts a fresh instance; this one doesn't.
  let enquiry;
  try {
    if (ip !== "unknown") {
      const recent = await db.enquiry.count({ where: { ip, createdAt: { gt: new Date(Date.now() - 10 * 60 * 1000) } } });
      if (recent >= 5) return NextResponse.json(TOO_MANY, { status: 429 });
    }
    enquiry = await db.enquiry.create({
    data: {
      name: data.name,
      email: data.email,
      company: data.company,
      website: data.website,
      phone: data.phone,
      services: JSON.stringify(data.services),
      budget: data.budget,
      message: data.message,
      ip,
      userAgent: req.headers.get("user-agent")?.slice(0, 300),
    },
  });
  } catch (err) {
    console.error("[contact] could not store enquiry", err);
    return NextResponse.json(FAILED, { status: 500 });
  }

  const mail = await sendEnquiryEmail({
    id: enquiry.id,
    name: data.name,
    email: data.email,
    company: data.company,
    website: data.website,
    phone: data.phone,
    services: data.services,
    budget: data.budget,
    message: data.message,
    createdAt: enquiry.createdAt,
  });

  // The enquiry is already saved, so a hiccup here must not make the visitor send it twice.
  await db.enquiry
    .update({ where: { id: enquiry.id }, data: { emailStatus: mail.status, emailError: mail.error ?? null } })
    .catch((err) => console.error("[contact] could not record email status", err));

  // The enquiry is safely stored even if email delivery failed.
  return NextResponse.json({ ok: true });
}
