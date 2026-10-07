import type { ReactNode } from 'react';

export interface PageSection {
  id: string;
  label: string;
}

/**
 * Jump list for the long legal pages.
 *
 * Terms, privacy and safety are each six to ten sections of dense text with no
 * way to get around them — you scroll. This puts a contents list beside the
 * document so a reader can jump straight to the part they were sent for,
 * which is usually the case with a policy page.

 * Deliberately a server component with no JavaScript: it is a list of anchor
 * links, and a contents list that only appears after hydration is no use to a
 * crawler or to anyone on a slow connection.
 */
export default function PageNav({
  title,
  sections,
  intro,
}: {
  title: string;
  sections: PageSection[];
  intro?: ReactNode;
}) {
  return (
    <nav className="page-nav" aria-labelledby="page-nav-title">
      <h2 className="page-nav-title" id="page-nav-title">
        {title}
      </h2>
      {intro ? <p className="page-nav-intro">{intro}</p> : null}
      <ol>
        {sections.map((s, i) => (
          <li key={s.id}>
            <a href={`#${s.id}`}>
              <span aria-hidden>{String(i + 1).padStart(2, '0')}</span>
              {s.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
