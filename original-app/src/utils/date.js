// src/utils/date.js

/**
 * One day in milliseconds.
 */
export const DAY_MS = 86_400_000;

/**
 * Monday – Friday returns true.
 */
export function isWeekday(d) {
  return ![0, 6].includes(d.getDay());
}

/**
 * Add n days to a Date.
 */
export function addDays(d, n) {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

/**
 * ISO helper used by Board.jsx
 * Returns "YYYY-MM-DD" for a Date object.
 */
export function iso(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Parse a date-string like "2025-06-01" or
 * "2025-06-01T00:00:00Z" into a **local-midnight**
 * Date object, ignoring any time-zone offset.
 */
export function parseLocalDate(dateStr) {
  const base = dateStr.split("T")[0]; // "YYYY-MM-DD"
  const [y, m, dd] = base.split("-").map(Number); // months 1-based
  return new Date(y, m - 1, dd); // months 0-based in JS
}
