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
