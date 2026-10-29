/** Keep only digits and a single decimal separator (comma or dot). */
export function sanitizeSwapAmountInput(raw: string): string {
  let s = raw.replace(/[^\d.,]/g, "");
  const sepIndex = s.search(/[.,]/);
  if (sepIndex >= 0) {
    const head = s.slice(0, sepIndex + 1);
    const tail = s.slice(sepIndex + 1).replace(/[.,]/g, "");
    s = head + tail;
  }
  return s;
}
