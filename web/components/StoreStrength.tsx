import Link from 'next/link';

/**
 * Store strength — the vendor's to-do list for getting enquiries.
 *
 * Every item is something a buyer looks for before tapping the WhatsApp button.
 * It is deliberately a server component: the score comes down with the page, so
 * there is no spinner and nothing to get wrong on a slow connection.
 */

interface Item {
  key: string;
  label: string;
  done: boolean;
  href: string;
  weight: number;
}

interface Props {
  completeness: {
    pct: number;
    done: Item[];
    missing: Item[];
    next: Item | null;
    level: 'empty' | 'starter' | 'good' | 'strong';
  } | null;
  businessSlug: string;
}

const LEVEL_NOTE: Record<string, string> = {
  empty: 'Buyers cannot find much here yet. Do the first three and your store starts working.',
  starter: 'A good start. Photos and a real description are what turn a visit into a WhatsApp message.',
  good: 'Looking solid. The items below are the ones still costing you enquiries.',
  strong: 'Your store reads as a real business. Keep it fresh — repost or bump slow items.',
};

export default function StoreStrength({ completeness, businessSlug }: Props) {
  if (!completeness) return null;
  const { pct, done, missing, next, level } = completeness;

  return (
    <div className="card panel strength">
      <h2>
        Store strength
        <span className={`strength-pill ${level}`} style={{ marginLeft: 10 }}>
          {pct}%
        </span>
      </h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.92rem', marginTop: -4 }}>
        {LEVEL_NOTE[level]}
        {next ? (
          <>
            {' '}
            <strong>Next:</strong> {next.label}.
          </>
        ) : (
          <> Everything on the list is done — <Link href={`/business/${businessSlug}`}>view your store ↗</Link></>
        )}
      </p>

      <div className="strength-bar" role="img" aria-label={`Store profile ${pct}% complete`}>
        <span style={{ width: `${pct}%` }} />
      </div>

      {missing.length > 0 && (
        <ul className="strength-list">
          {missing.slice(0, 5).map((i) => (
            <li key={i.key}>
              <span className="strength-dot" aria-hidden />
              <span className="strength-label">{i.label}</span>
              <Link className="mini-btn" href={i.href}>
                Fix
              </Link>
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: 12, marginBottom: 0 }}>
          Done: {done.length} of {done.length + missing.length} — {done.map((d) => d.key).join(', ')}.
        </p>
      )}
    </div>
  );
}
