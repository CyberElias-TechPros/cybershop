import Link from "next/link";
import { sql } from "drizzle-orm";
import { businesses } from "@/db/schema";
import { getDb } from "@/db/client";
import { PUBLIC_BIZ } from "@/db/read";
import { Button } from "@/ui/kit";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const db = getDb();
  const [live] = await db.select({ n: sql<number>`count(*)::int` }).from(businesses).where(PUBLIC_BIZ);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-paper)_88%,transparent)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-[var(--color-ink)] text-[.7rem] font-bold text-white">CS</span>
            Cybershop
          </Link>
          <nav className="ml-2 hidden items-center gap-1 text-sm sm:flex" aria-label="Main">
            <Link className="link px-2 py-1" href="/discover">Discover</Link>
            <Link className="link px-2 py-1" href="/how-it-works">How it works</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-[var(--color-ink-faint)] md:inline">{Number(live?.n ?? 0)} stores live</span>
            <Button size="sm" variant="ghost" href="/login">Sign in</Button>
            <Button size="sm" href="/signup">Open your store</Button>
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">{children}</main>
      <footer className="mt-16 border-t border-[var(--color-line)] bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm md:grid-cols-4">
          <div className="md:col-span-2">
            <p className="font-semibold">Cybershop</p>
            <p className="mt-1 max-w-prose text-[var(--color-ink-soft)]">
              A storefront and catalogue for any business, with WhatsApp as the checkout counter. We never touch the money between you and your customer.
            </p>
          </div>
          <div>
            <p className="font-semibold">For buyers</p>
            <ul className="mt-2 space-y-1">
              <li><Link className="link" href="/discover">Browse catalogues</Link></li>
              <li><Link className="link" href="/how-it-works">How enquiries work</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold">For businesses</p>
            <ul className="mt-2 space-y-1">
              <li><Link className="link" href="/signup">Create a store</Link></li>
              <li><Link className="link" href="/login">Vendor sign in</Link></li>
              <li><Link className="link" href="/dashboard">Dashboard</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-[var(--color-line)] px-4 py-4 text-center text-xs text-[var(--color-ink-faint)]">
          Demo data seeded locally. Prices and stock are set by each business, not by Cybershop.
        </div>
      </footer>
    </div>
  );
}
