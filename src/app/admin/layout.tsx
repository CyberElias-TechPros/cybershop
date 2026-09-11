import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, userHasPermission, type Permission } from "@/core/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin", robots: { index: false, follow: false } };

const NAV: Array<{ href: string; label: string; perm: Permission }> = [
  { href: "/admin", label: "Overview", perm: "analytics.view" },
  { href: "/admin/payments", label: "Payments", perm: "payments.view" },
  { href: "/admin/businesses", label: "Businesses", perm: "vendors.view" },
  { href: "/admin/catalogue", label: "Catalogue", perm: "catalogue.view" },
  { href: "/admin/schema", label: "Categories & fields", perm: "schema.manage" },
  { href: "/admin/plans", label: "Plans & add-ons", perm: "subscriptions.manage" },
  { href: "/admin/audit", label: "Audit log", perm: "audit_logs.view" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/admin");
  const visible: typeof NAV = [];
  for (const item of NAV) if (await userHasPermission(user, item.perm)) visible.push(item);
  if (!visible.length) {
    return (
      <div className="grid min-h-dvh place-items-center px-4">
        <div className="card card-pad max-w-md text-center">
          <h1 className="text-lg font-semibold">Not an admin account</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            You are signed in as {user.name}, but this account has no platform permissions.
          </p>
          <p className="mt-3"><Link className="link" href="/dashboard">Go to my dashboard</Link></p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--color-paper)]">
      <header className="border-b border-[var(--color-line)] bg-[var(--color-ink)] text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <span className="rounded bg-white/15 px-1.5 py-0.5 text-[.65rem] font-bold uppercase tracking-wider">Admin</span>
          <nav aria-label="Admin" className="no-scrollbar flex gap-1 overflow-x-auto text-sm">
            {visible.map((i) => (
              <Link key={i.href} href={i.href} className="rounded px-2.5 py-1 whitespace-nowrap text-white/80 hover:bg-white/10 hover:text-white">{i.label}</Link>
            ))}
          </nav>
          <span className="ml-auto hidden text-xs text-white/60 sm:inline">{user.name}</span>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
