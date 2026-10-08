import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  let s = v == null ? "" : String(v);
  // Prevent spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export async function GET() {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });

  const rows = await db.enquiry.findMany({ orderBy: { createdAt: "desc" } });
  const header = ["Date", "Status", "Name", "Email", "Company", "Website", "Phone", "Services", "Budget", "Message", "Email notification"];
  const lines = rows.map((r) => {
    let services = "";
    try {
      services = (JSON.parse(r.services) as string[]).join("; ");
    } catch {}
    return [r.createdAt.toISOString(), r.status, r.name, r.email, r.company, r.website, r.phone, services, r.budget, r.message, r.emailStatus]
      .map(cell)
      .join(",");
  });
  const csv = "﻿" + [header.map(cell).join(","), ...lines].join("\r\n");
  const date = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="shaderlabs-enquiries-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
