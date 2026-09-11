const nf = new Intl.NumberFormat('en-NG');

/** kobo (NGN minor unit) → "₦450,000" */
export function formatNaira(kobo: number | null | undefined, opts: { decimals?: boolean } = {}): string {
  if (kobo === null || kobo === undefined || Number.isNaN(kobo)) return '';
  const naira = kobo / 100;
  if (opts.decimals && Math.round(naira * 100) % 100 !== 0) {
    return `₦${naira.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `₦${nf.format(Math.round(naira))}`;
}
