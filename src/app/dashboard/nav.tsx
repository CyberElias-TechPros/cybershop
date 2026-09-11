"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import type { Permission } from "@/core/auth";

const ITEMS: Array<{ href: string; label: string; icon: string; perm?: Permission; badge?: string }> = [
  { href: "/dashboard", label: "Overview", icon: "home" },
  { href: "/dashboard/catalogue", label: "Catalogue", icon: "grid", perm: "catalogue.view" },
  { href: "/dashboard/leads", label: "Enquiries", icon: "chat", perm: "leads.edit" },
  { href: "/dashboard/whatsapp", label: "WhatsApp", icon: "phone", perm: "whatsapp.manage" },
  { href: "/dashboard/media", label: "Media", icon: "image", perm: "media.view" },
  { href: "/dashboard/storefront", label: "Storefront", icon: "sparkle", perm: "storefront.edit" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "chart", perm: "analytics.view" },
  { href: "/dashboard/settings", label: "Settings", icon: "gear" },
];

export function DashboardNav({ permissions, businessId }: { permissions: Permission[]; businessId: string }) {
  const pathname = usePathname();
  const visible = ITEMS.filter((i) => !i.perm || permissions.includes(i.perm));
  return (
    <nav aria-label="Dashboard" className="no-scrollbar flex gap-1 overflow-x-auto border-t border-[var(--color-line)] px-2 py-2 lg:flex-col lg:border-t-0 lg:px-2 lg:py-2">
      {visible.map((i) => {
        const active = i.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition",
              active ? "bg-[var(--color-ink)] text-white" : "text-[var(--color-ink-soft)] hover:bg-[rgb(20_18_26/.05)]",
            )}
          >
            <Icon name={i.icon} active={active} />
            {i.label}
          </Link>
        );
      })}
      <Link href={`/dashboard/catalogue/new?business=${businessId}`}
        className="btn btn-wa btn-sm ml-auto shrink-0 lg:mt-2 lg:ml-0 lg:w-full">
        + Add item
      </Link>
    </nav>
  );
}

function Icon({ name, active }: { name: string; active: boolean }) {
  const d: Record<string, string> = {
    home: "M3 10.5 12 3l9 7.5V21H3z",
    grid: "M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z",
    chat: "M4 4h16v12H7l-3 3z",
    phone: "M6 3h4l2 5-3 2a10 10 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 4 5a2 2 0 0 1 2-2z",
    image: "M3 5h18v14H3zm4 9 4-4 3 3 3-2 4 4H7z",
    sparkle: "m12 3 2 5 5 2-5 2-2 5-2-5-5-2 5-2z",
    chart: "M4 20V10m5 10V4m5 16v-7m5 7V8",
    gear: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 shrink-0" fill={name === "chart" ? "none" : "currentColor"}
      stroke={name === "chart" ? "currentColor" : "none"} strokeWidth={name === "chart" ? 2 : 0} strokeLinecap="round">
      <path d={d[name] ?? d.grid} />
    </svg>
  );
}
