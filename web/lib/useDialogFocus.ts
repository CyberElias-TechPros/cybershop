'use client';

import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Minimal dialog behaviour for the overlays in this app (the mobile menu and
 * the WhatsApp-cart drawer): Escape closes, focus moves in on open, Tab cycles
 * inside the overlay, focus returns to the control that opened it, and the page
 * behind can be scroll-locked.
 *
 * Without this, an overlay that hides the page still lets keyboard focus wander
 * into the content underneath — the visitor tabs to links they cannot see.
 */
export function useDialogFocus(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  opts: { lockScroll?: boolean } = {}
) {
  const { lockScroll = false } = opts;

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    const opener = document.activeElement as HTMLElement | null;

    const items = () =>
      Array.from(node?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
      );

    // move focus in on the next frame, once the overlay is laid out
    const raf = requestAnimationFrame(() => (items()[0] ?? node)?.focus?.());

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = items();
      if (list.length === 0) return;
      const first = list[0]!;
      const last = list[list.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !node?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !node?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    if (lockScroll) document.documentElement.classList.add('no-scroll');

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);
      if (lockScroll) document.documentElement.classList.remove('no-scroll');
      // restore focus only if the opener is still on the page
      if (opener?.isConnected) opener.focus?.();
    };
  }, [open, ref, onClose, lockScroll]);
}
