// Money helpers. Every amount in Finance is a whole number of Uganda shillings (UGX).
export const num = (value: number) => Math.round(value).toLocaleString('en-US');
export const ugx = (value: number) => `UGX ${num(value)}`;

/** "1,250,000", "UGX 1 250 000" or "1250000" → 1250000. Anything else (letters, decimals, negatives) → null. */
export function parseUgx(text: string): number | null {
  const clean = text.replace(/ugx/gi, '').replace(/[,\s]/g, '');
  if (!/^\d{1,11}$/.test(clean)) return null;
  return Number(clean);
}

export function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const METHOD_LABELS: Record<string, string> = { cash: 'Cash', mobile_money: 'Mobile money', bank: 'Bank', cheque: 'Cheque', other: 'Other' };
export const TYPE_LABELS: Record<string, string> = { day: 'Day', boarding: 'Boarding' };
export const COMMON_ITEMS = ['Tuition', 'Boarding', 'Lunch', 'Medical', 'Development', 'Exams', 'Uniform', 'Transport'];
