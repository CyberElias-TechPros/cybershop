import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, ROLE_GRANTS, type Permission } from "@/core/auth";
import { logoutAction } from "@/app/(auth)/actions";
import { DashboardNav } from "./nav";

export const metadata = { title: "Dashboard", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/dashboard");
  const mine = user.memberships;
  if (!mine.length) {
    // admin-only account landed here
    if (user.platformRoles.length) redirect("/admin");
    redirect("/signup");
  }
  const active = mine[0]!;

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-paper)] lg:flex-row">
      <aside className="border-b border-[var(--color-line)] bg-white lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 px-4 py-3 lg:block lg:py-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-[var(--color-ink)] text-[.7rem] font-bold text-white">CS</span>
            <span className="hidden lg:inline">Cybershop</span>
          </Link>
          <div className="ml-auto text-right lg:ml-0 lg:mt-3">
            <p className="truncate text-sm font-semibold lg:leading-tight">{active.name}</p>
            <p className="text-xs text-[var(--color-ink-faint)]">{active.roleKey} · <Link className="link" href={`/business/${active.slug}`} target="_blank">view store</Link></p>
          </div>
        </div>
        <DashboardNav permissions={userRolePermissions(active.roleKey)} businessId={active.businessId} />
        <form action={logoutAction} className="hidden px-4 pb-4 lg:block">
          <button className="btn btn-ghost btn-sm btn-block" type="submit">Sign out</button>
        </form>
      </aside>
      <main id="main" className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-8">
        <div className="mx-auto max-w-5xl">{children}</div>
        <form action={logoutAction} className="mx-auto mt-10 max-w-5xl lg:hidden">
          <button className="btn btn-ghost btn-sm btn-block" type="submit">Sign out</button>
        </form>
      </main>
    </div>
  );
}

function userRolePermissions(roleKey: string): Permission[] {
  return (ROLE_GRANTS[roleKey] ?? []) as Permission[];
}
