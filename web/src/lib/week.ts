// Date helpers, format YYYY-MM-DD. Plans are keyed by the day they start,
// not necessarily a Monday.
export function today(): string {
  return new Date().toLocaleDateString("en-CA");
}

export function isDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T12:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function shiftWeek(day: string, weeks: number): string {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 7 * weeks);
  return d.toISOString().slice(0, 10);
}
