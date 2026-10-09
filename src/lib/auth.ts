import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const SESSION_COOKIE = "sl_admin";
const SESSION_DAYS = 30; // long enough that the installed mail app stays signed in

function secret() {
  const s = process.env.ADMIN_SECRET;
  if (!s || s.length < 16) throw new Error("ADMIN_SECRET must be set (16+ characters).");
  return s;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkPassword(input: string) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || expected === "change-me") return false;
  // Compare HMACs so lengths always match.
  return safeEqual(sign(`pw:${input}`), sign(`pw:${expected}`));
}

export function createSessionToken() {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${exp}.${sign(`session:${exp}`)}`;
}

function verifySessionToken(token: string | undefined) {
  if (!token) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!exp || !sig || exp < Date.now()) return false;
  return safeEqual(sig, sign(`session:${exp}`));
}

export async function isAdmin() {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/** For pages: a layout's check alone isn't enough, since layouts aren't re-run on every request. */
export async function requireAdmin(next: string) {
  if (!(await isAdmin())) redirect(`/admin/login?next=${next}`);
}

export const sessionCookieOptions = {
  httpOnly: true,
  // "lax", not "strict": phones don't send strict cookies when the installed mail app is opened
  // from the home screen or a notification, which made it ask for the password every time.
  // Writes stay protected: server actions check the request's origin, and lax cookies aren't sent on cross-site POSTs.
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production" && process.env.SITE_URL?.startsWith("https"),
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};
