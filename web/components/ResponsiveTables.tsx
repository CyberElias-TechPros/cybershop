'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Two jobs for the workbench tables, both of which only exist once a
 * client-side fetch has landed.
 *
 * 1. Phone layout. Admin and vendor tables are seven or eight columns wide.
 *    Above 700px they are tables; between 561px and 700px §18 pins the first
 *    column so the subject of the row never scrolls away. Below 561px there
 *    is no width left to work with, so the row becomes a stacked record card
 *    instead — heading on the left, value on the right.
 *
 *    A stacked cell is meaningless without its column heading, and the tables
 *    live in eighteen screens that each build their own headers, so rather
 *    than hand-labelling every <td> (and desynchronising the moment someone
 *    adds a column) this copies each table's real <th> text onto the cells at
 *    runtime. `data-label` is what the stylesheet renders.
 *
 *    Deliberate progressive enhancement: the stacked layout is gated on the
 *    `.is-stacked` class added here, so with JavaScript off — or before it
 *    runs — the table keeps §18's sticky first column instead of collapsing
 *    into an unlabelled pile of values.
 *
 * 2. Result announcements. Typing in a filter box re-fetches and replaces the
 *    rows silently, which is invisible to a screen reader. Each table's row
 *    count is watched and announced in a polite live region.
 */

const STACKED = 'is-stacked';
const LABEL = 'data-label';

/** Every table that should get the phone treatment. */
const TABLE_SELECTOR = 'table.tbl, table.data-table';

/** Skeleton and "no rows" rows span the table; they are not results. */
function isFullWidth(cell: Element): boolean {
  const span = cell.getAttribute('colspan');
  return Boolean(span && span !== '1');
}

function countRows(table: Element): number {
  const body = table.querySelector('tbody');
  if (!body) return 0;
  let n = 0;
  for (const row of Array.from(body.querySelectorAll('tr'))) {
    const cells = Array.from(row.children).filter((c) => c.tagName === 'TD');
    if (!cells.length || cells.every(isFullWidth)) continue;
    n += 1;
  }
  return n;
}

function annotate(root: ParentNode): number {
  const tables = root.querySelectorAll?.(TABLE_SELECTOR);
  if (!tables) return -1;

  let latest = -1;

  for (const table of Array.from(tables)) {
    const head = table.querySelector('thead');
    if (!head) continue;

    // Most recent table to change is the one the user is looking at.
    const rows = countRows(table);
    latest = rows;

    const headers = Array.from(head.querySelectorAll('th')).map((th) =>
      (th.textContent || '').replace(/\s+/g, ' ').trim(),
    );
    if (!headers.length) continue;

    const body = table.querySelector('tbody') || table;
    for (const row of Array.from(body.querySelectorAll('tr'))) {
      const cells = Array.from(row.children).filter((c) => c.tagName === 'TD');
      cells.forEach((cell, i) => {
        if (isFullWidth(cell)) {
          if (cell.hasAttribute(LABEL)) cell.removeAttribute(LABEL);
          return;
        }
        const label = headers[i];
        if (!label) return;
        // Only write when it differs: the MutationObserver below watches the
        // same subtree, so writing on every pass would loop forever.
        if (cell.getAttribute(LABEL) !== label) cell.setAttribute(LABEL, label);
      });
    }

    if (!table.classList.contains(STACKED)) table.classList.add(STACKED);
  }

  return latest;
}

let sharedTimer: ReturnType<typeof setTimeout> | null = null;
let refCount = 0;
let sharedObserver: MutationObserver | null = null;

/**
 * Mounted once per workbench layout. Tables are filled by client-side
 * fetches, so the rows do not exist when this mounts — a MutationObserver
 * catches them whenever they arrive (filter change, pagination, polling).
 */
export default function ResponsiveTables() {
  const [announcement, setAnnouncement] = useState('');
  const lastCount = useRef<number | null>(null);

  useEffect(() => {
    const root = document.querySelector('.dash-main') || document.body;

    const run = () => {
      const rows = annotate(root);
      if (rows < 0) return;
      // Announce only on a real change, otherwise updating the live region
      // mutates the subtree we are observing and the loop never settles.
      if (lastCount.current !== rows) {
        lastCount.current = rows;
        setAnnouncement(rows === 1 ? '1 result' : `${rows} results`);
      }
    };
    run();

    refCount += 1;
    if (!sharedObserver) {
      sharedObserver = new MutationObserver(() => {
        if (sharedTimer) clearTimeout(sharedTimer);
        sharedTimer = setTimeout(run, 80);
      });
      sharedObserver.observe(root, { childList: true, subtree: true });
    }

    return () => {
      refCount -= 1;
      if (refCount <= 0 && sharedObserver) {
        sharedObserver.disconnect();
        sharedObserver = null;
        if (sharedTimer) {
          clearTimeout(sharedTimer);
          sharedTimer = null;
        }
      }
    };
  }, []);

  return (
    <p className="visually-hidden" role="status" aria-live="polite">
      {announcement}
    </p>
  );
}
