import Link from "next/link";
import clsx from "clsx";
import type { ReactNode } from "react";

/* Deliberately small: BUILD_PLAN 18 - one Button/Card/Field used by all three surfaces. */

type BtnProps = {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "wa";
  size?: "sm" | "md" | "lg";
  block?: boolean;
  href?: string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement> & { target?: string; rel?: string };

export function Button({ variant = "primary", size = "md", block, href, className, children, ...rest }: BtnProps) {
  const cls = clsx(
    "btn", `btn-${variant}`, size === "sm" && "btn-sm", size === "lg" && "btn-lg", block && "btn-block", className,
  );
  if (href) {
    const external = /^https?:/.test(href);
    return (
      <a
        href={href} className={cls} target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
      >{children}</a>
    );
  }
  const { ...buttonProps } = rest as React.ButtonHTMLAttributes<HTMLButtonElement>;
  return <button type={buttonProps.type ?? "submit"} className={cls} {...buttonProps}>{children}</button>;
}

export function Card({ className, children, as: As = "div" }: { className?: string; children: ReactNode; as?: "div" | "section" | "article" | "li" }) {
  return <As className={clsx("card", className)}>{children}</As>;
}

export function Badge({ tone = "mute", children, className }: { tone?: "ok" | "warn" | "danger" | "info" | "mute"; children: ReactNode; className?: string }) {
  return <span className={clsx("badge", `badge-${tone}`, className)}>{children}</span>;
}

export function Field({ label, hint, error, required, htmlFor, children, id }: {
  label: string; hint?: string | null; error?: string | null; required?: boolean; htmlFor?: string; children: ReactNode; id?: string;
}) {
  const errId = id ? `${id}-err` : undefined;
  const hintId = id ? `${id}-hint` : undefined;
  return (
    <div className="field" id={id}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-[.75rem] font-normal text-[var(--color-danger)]">required</span> : <span className="text-[.75rem] font-normal text-[var(--color-ink-faint)]">optional</span>}
      </label>
      {hint ? <p className="field-hint" id={hintId}>{hint}</p> : null}
      {children}
      {error ? <p className="field-error" id={errId} role="alert">{error}</p> : null}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card card-pad text-center">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mx-auto mt-1 max-w-prose text-sm text-[var(--color-ink-soft)]">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Meter({ pct, label, value, tone }: { pct: number | null; label: string; value: string; tone?: "ok" | "warn" | "danger" }) {
  const p = pct === null ? 0 : Math.min(100, Math.max(0, pct));
  const t = tone ?? (p >= 100 ? "danger" : p >= 80 ? "warn" : "ok");
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-[var(--color-ink-faint)]">{value}</span>
      </div>
      <div role="progressbar" aria-valuenow={pct ?? undefined} aria-valuemin={0} aria-valuemax={100} aria-label={label}
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-line)]">
        <div className={clsx("h-full rounded-full transition-[width]",
          t === "danger" ? "bg-[var(--color-danger)]" : t === "warn" ? "bg-[var(--color-warn)]" : "bg-[var(--color-ok)]")}
          style={{ width: `${pct === null ? 100 : p}%` }} />
      </div>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <Card className="card-pad">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-[var(--color-ink-faint)]">{sub}</p> : null}
    </Card>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { tone: "ok" | "warn" | "danger" | "info" | "mute"; label: string }> = {
    published: { tone: "ok", label: "Live" }, active: { tone: "ok", label: "Active" },
    draft: { tone: "mute", label: "Draft" }, unpublished: { tone: "warn", label: "Hidden" },
    archived: { tone: "mute", label: "Archived" }, scheduled: { tone: "info", label: "Scheduled" },
    pending: { tone: "warn", label: "Pending" }, pending_payment: { tone: "warn", label: "Awaiting payment" },
    payment_submitted: { tone: "warn", label: "Payment submitted" }, under_review: { tone: "warn", label: "Under review" },
    verified: { tone: "ok", label: "Verified" }, rejected: { tone: "danger", label: "Rejected" },
    suspended: { tone: "danger", label: "Suspended" }, expired: { tone: "danger", label: "Expired" },
    grace: { tone: "warn", label: "In grace" }, cancelled: { tone: "mute", label: "Cancelled" },
    new: { tone: "info", label: "New" }, contacted: { tone: "info", label: "Contacted" },
    interested: { tone: "warn", label: "Interested" }, negotiating: { tone: "warn", label: "Negotiating" },
    converted: { tone: "ok", label: "Converted" }, lost: { tone: "mute", label: "Lost" },
  };
  const m = map[status] ?? { tone: "mute" as const, label: status };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function Tabs({ items, current, basePath, param = "tab" }: { items: Array<{ key: string; label: string; count?: number }>; current: string; basePath: string; param?: string }) {
  return (
    <nav aria-label="Filter" className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {items.map((t) => {
        const active = t.key === current;
        const qs = t.key === "all" ? "" : `?${param}=${t.key}`;
        return (
          <Link key={t.key} href={`${basePath}${qs}`} aria-current={active ? "page" : undefined}
            className={clsx("rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition",
              active ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-white" : "border-[var(--color-line-strong)] bg-white hover:border-[var(--color-ink-faint)]")}>
            {t.label}{typeof t.count === "number" ? <span className={clsx("ml-1 tabular-nums", active ? "text-white/70" : "text-[var(--color-ink-faint)]")}>{t.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** renders a Server Action result without a toast library (plan.md 13.3) */
export function FormMessage({ error, ok: okMsg }: { error?: string | null; ok?: string | null }) {
  if (error) return <p role="alert" className="rounded-lg border border-[#f0c0bd] bg-[#fdf1f0] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>;
  if (okMsg) return <p role="status" className="rounded-lg border border-[#b7e0c4] bg-[#f0fbf3] px-3 py-2 text-sm text-[var(--color-ok)]">{okMsg}</p>;
  return null;
}

export function Money({ value, currency = "NGN", className }: { value: string | number | null | undefined; currency?: string; className?: string }) {
  if (value === null || value === undefined || value === "") return <span className={clsx("text-[var(--color-ink-faint)]", className)}>Price on request</span>;
  const n = typeof value === "number" ? value : Number(value);
  const text = Number.isFinite(n)
    ? (currency === "NGN" ? "\u20a6" : `${currency} `) + n.toLocaleString("en-NG", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })
    : String(value);
  return <span className={className}>{text}</span>;
}

export function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={clsx("size-[1.15em] shrink-0", className)} fill="currentColor">
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.76-1.66-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47s1.07 2.87 1.22 3.07c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.48 1.69.62.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.42.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35zM12.02 2.4c-5.3 0-9.6 4.3-9.6 9.6 0 1.7.44 3.35 1.29 4.81L2.4 21.6l4.93-1.29a9.57 9.57 0 0 0 4.69 1.2h.01c5.3 0 9.6-4.3 9.6-9.6 0-2.57-1-4.98-2.82-6.8A9.55 9.55 0 0 0 12.02 2.4z" />
    </svg>
  );
}
