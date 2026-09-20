// Format a quantity with unicode fractions: 0.5 -> ½, 1.5 -> 1½.
const FRACS: [number, string][] = [
  [0.125, "⅛"],
  [0.25, "¼"],
  [1 / 3, "⅓"],
  [0.375, "⅜"],
  [0.5, "½"],
  [0.625, "⅝"],
  [2 / 3, "⅔"],
  [0.75, "¾"],
  [0.875, "⅞"],
];

export function formatQty(q: number): string {
  if (q <= 0) return "0";
  const whole = Math.floor(q + 1e-9);
  const frac = q - whole;
  for (const [v, s] of FRACS) {
    if (Math.abs(frac - v) < 0.02) {
      return (whole > 0 ? String(whole) : "") + s;
    }
  }
  if (frac < 0.02) return String(whole);
  // No nice fraction: round to 2 decimals.
  return String(Math.round(q * 100) / 100);
}
