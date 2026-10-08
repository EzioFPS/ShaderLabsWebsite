"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, createSessionToken, isAdmin, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { STATUSES } from "@/lib/statuses";

export async function login(_prev: { error?: string } | undefined, formData: FormData) {
  const h = await headers();
  const ip = (h.get("cf-connecting-ip") || h.get("x-forwarded-for")?.split(",")[0] || "local").trim();
  if (!rateLimit(`login:${ip}`, 8, 15 * 60 * 1000)) {
    return { error: "Too many attempts. Try again in 15 minutes." };
  }
  const password = String(formData.get("password") ?? "");
  if (!checkPassword(password)) {
    return { error: "Wrong password." };
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(), sessionCookieOptions);
  redirect("/admin");
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/admin/login");
}

export async function updateStatus(formData: FormData) {
  if (!(await isAdmin())) redirect("/admin/login");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !(STATUSES as readonly string[]).includes(status)) return;
  await db.enquiry.update({ where: { id }, data: { status } });
  revalidatePath("/admin");
}
