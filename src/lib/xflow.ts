import "server-only";

// Xflow API client (https://docs.xflowpay.com, export API 2024-02-05).
// The key decides the mode: sk_test_… is test mode (fake money), sk_live_… is live.

const BASE = "https://api.xflowpay.com";

export const xflowConfigured = () => Boolean(process.env.XFLOW_API_KEY);
export const xflowTestMode = () => (process.env.XFLOW_API_KEY ?? "").startsWith("sk_test_");

export class XflowError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Init = { method?: "GET" | "POST"; body?: unknown; form?: FormData; query?: Record<string, string | number | undefined> };

export async function xflow<T>(path: string, init: Init = {}): Promise<T> {
  const key = process.env.XFLOW_API_KEY;
  if (!key) throw new XflowError(0, "XFLOW_API_KEY is not set");
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));

  const res = await fetch(url, {
    method: init.method ?? (init.body || init.form ? "POST" : "GET"),
    headers: { Authorization: `Bearer ${key}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    body: init.form ?? (init.body ? JSON.stringify(init.body) : undefined),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text;
    try {
      const j = JSON.parse(text);
      message = j.errors?.map((e: { message?: string; field?: string }) => [e.field, e.message].filter(Boolean).join(": ")).join("; ") || j.message || text;
    } catch {}
    throw new XflowError(res.status, `Xflow ${res.status}: ${message}`.slice(0, 500));
  }
  return res.json() as Promise<T>;
}

/** Downloads a file uploaded to Xflow (e.g. an invoice PDF). */
export async function xflowFileContents(fileId: string) {
  const res = await fetch(new URL(`/v1/files/${encodeURIComponent(fileId)}/contents`, BASE), {
    headers: { Authorization: `Bearer ${process.env.XFLOW_API_KEY}` },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new XflowError(res.status, `Xflow ${res.status}: couldn't download the file`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), type: res.headers.get("content-type") || "application/pdf" };
}

type List<T> = { data: T[]; has_next: boolean };

/** Fetches every page of a list endpoint (Xflow returns at most 10 per page). */
export async function listAll<T extends { id: string }>(path: string, query: Record<string, string | number | undefined> = {}, maxPages = 50) {
  const out: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const r = await xflow<List<T>>(path, { query: { ...query, limit: 10, starting_after: after } });
    out.push(...r.data);
    if (!r.has_next || !r.data.length) break;
    after = r.data[r.data.length - 1].id;
  }
  return out;
}

// Short cache so the dashboard doesn't refetch everything on every click.
const cache = new Map<string, { at: number; value: Promise<unknown> }>();
export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load().catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, { at: Date.now(), value });
  return value;
}
export const clearXflowCache = () => cache.clear();

// ---------- object shapes (only the fields we use) ----------

export type Money = { amount: string; currency: string };

export type XAccount = {
  id: string;
  type: string;
  status: string;
  nickname: string | null;
  created: number;
  business_details?: {
    legal_name?: string;
    email?: string;
    type?: string;
    physical_address?: { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string };
  };
};

export type XReceivable = {
  id: string;
  account_id: string;
  status: string; // draft | verifying | activated | input_required | hold | cancelled | …
  currency: string;
  created: number;
  amount_maximum_reconcilable: string;
  amount_reconcilable: string;
  amount_reconciled: string;
  amount_settled_payouts: string;
  invoice?: { amount: string; currency: string; creation_date: string; due_date: string; reference_number: string; document?: string };
  system_message?: { message?: string; code?: string }[] | null;
  metadata?: Record<string, string> | null;
};

export type XDeposit = {
  id: string;
  amount: string;
  net_amount: string;
  currency: string;
  created: number;
  status: string; // initialized | processing | completed | cancelled | failed | reversed
  payment_method: string;
  statement_descriptor: string | null;
  from?: { account_id?: string; address_id?: string };
  to?: { account_id?: string; address_id?: string };
};

export type XPayout = {
  id: string;
  amount: string;
  currency: string;
  created: number;
  arrival_date: number | null;
  status: string; // initialized | processing | settled | failed | hold
  statement_descriptor: string | null;
};

export type XBalance = { available: Money[]; pending: Money[]; processing: Money[]; payout_processing: Money[] };

export type XAddress = {
  id: string;
  category: string;
  currency: string;
  status: string;
  name: string | null;
  linked_id: string;
  type: string;
  bank_account?: {
    number?: string | null;
    last4?: string | null;
    iban?: string | null;
    domestic_credit?: string | null;
    domestic_wire?: string | null;
    global_wire?: string | null;
  } | null;
  billing_details?: { line1?: string; city?: string; country?: string } | null;
};

export type XPaymentLink = { id: string; link: string; status: string; expires_at: number };

export type XQuote = { buy?: Money; sell?: Money; rate?: string; fx_rate?: string; id?: string };
