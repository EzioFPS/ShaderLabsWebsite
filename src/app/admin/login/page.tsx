import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Admin login", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && /^\/admin(\/[A-Za-z0-9/_-]*)?$/.test(next) ? next : undefined;
  if (await isAdmin()) redirect(safeNext ?? "/admin");
  return (
    <section className="flex min-h-[80svh] items-center pt-28 pb-20">
      <div className="container-x">
        <div className="card mx-auto w-full max-w-md p-8 md:p-10">
          <p className="eyebrow">Admin</p>
          <h1 className="display display-sm mt-4">Login</h1>
          <p className="mt-3 text-muted">Enter the admin password to continue.</p>
          <LoginForm next={safeNext} />
        </div>
      </div>
    </section>
  );
}
