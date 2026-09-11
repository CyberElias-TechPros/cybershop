/**
 * Haptic landscape — tiny, purposeful vibrations where the platform supports
 * them (Android Chrome / Android WebView via navigator.vibrate).
 * Silently no-ops everywhere else (iOS Safari has no web vibration API).
 *
 * Map:
 *  - pop     single light tick  → grabbing the swipe slider, taps
 *  - double  tap–gap–tap        → something succeeded (proof uploaded, slide completed)
 *  - deep    long rumble        → errors
 *  - long    sustained pulse    → leaving for WhatsApp
 */
type Named = 'pop' | 'double' | 'deep' | 'long';

const PATTERNS: Record<Named, number | number[]> = {
  pop: 14,
  double: [12, 70, 12],
  deep: [30, 40, 30, 40, 30],
  long: 60,
};

export function haptic(p: Named | number | number[] = 'pop') {
  try {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
    const pattern = typeof p === 'string' ? (PATTERNS[p] ?? 14) : p;
    navigator.vibrate(pattern);
  } catch {
    /* haptics must never break the UI */
  }
}
