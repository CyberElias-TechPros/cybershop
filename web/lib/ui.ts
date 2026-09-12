/** Small presentation helpers shared by server + client components. */

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?'
  );
}

/** "duration_mode" → "Duration Mode" */
export function humanize(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Render a dynamic catalogue field value for display. */
export function formatField(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
  return String(value);
}

export function location(b: { city: string | null; state_region: string | null }): string | null {
  const parts = [b.city, b.state_region].filter(Boolean) as string[];
  return parts.length ? parts.join(', ') : null;
}

/** “3+ months on CyberShop” — trust chip, never a fake rating. */
export function tenureLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(t)) return null;
  const days = Math.max(0, (Date.now() - t) / 86400000);
  if (days < 14) return 'New on CyberShop';
  if (days < 365) {
    const m = Math.max(1, Math.floor(days / 30));
    return `${m}+ month${m === 1 ? '' : 's'} on CyberShop`;
  }
  const y = Math.floor(days / 365);
  return `${y}+ year${y === 1 ? '' : 's'} on CyberShop`;
}

export function timeAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 14) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}
