// Week helpers: weeks are keyed by Monday, format YYYY-MM-DD.
export function mondayOf(d: Date = new Date()): string {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = (dt.getUTCDay() + 6) % 7; // Monday = 0
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
}

export function isMonday(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return mondayOf(new Date(s + "T12:00:00Z")) === s;
}

export function shiftWeek(monday: string, weeks: number): string {
  const d = new Date(monday + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 7 * weeks);
  return d.toISOString().slice(0, 10);
}
