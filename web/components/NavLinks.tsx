'use client';

import { usePathname } from 'next/navigation';

/**
 * Primary nav links with a current-page indicator. Client-only so it can
 * read the pathname; the header itself stays a server component (the
 * category list is fetched server-side and passed in).
 */
export default function NavLinks({
  links,
}: {
  links: { href: string; label: string }[];
}) {
  const pathname = usePathname();
  return (
    <>
      {links.map((l) => {
        const current = pathname === l.href || (l.href !== '/' && pathname.startsWith(l.href + '/'));
        return (
          <a
            key={l.href}
            href={l.href}
            className={current ? 'is-current' : undefined}
            aria-current={current ? 'page' : undefined}
          >
            {l.label}
          </a>
        );
      })}
    </>
  );
}
