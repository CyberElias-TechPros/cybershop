import Link from 'next/link';

interface Props {
  page: number;
  pages: number;
  makeUrl: (page: number) => string;
}

export default function Pager({ page, pages, makeUrl }: Props) {
  if (pages <= 1) return null;
  const items: (number | '…')[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) items.push(p);
    else if (items[items.length - 1] !== '…') items.push('…');
  }
  return (
    <nav className="pager" aria-label="Pagination">
      {items.map((it, i) =>
        it === '…' ? (
          <span key={`e${i}`}>…</span>
        ) : it === page ? (
          <span key={it} className="current" aria-current="page">
            {it}
          </span>
        ) : (
          <Link key={it} href={makeUrl(it)}>
            {it}
          </Link>
        )
      )}
    </nav>
  );
}
