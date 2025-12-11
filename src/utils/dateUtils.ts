/**
 * Date Utilities
 * Date formatting and manipulation for the board view
 */

// ═══════════════════════════════════════════════════════════
// DATE FORMATTING
// ═══════════════════════════════════════════════════════════

/**
 * Format date as "YYYY-MM-DD" (ISO format for DB)
 */
export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse ISO date string to Date object (in local timezone)
 */
export function parseISODate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Get day name (Mon, Tue, etc.)
 */
export function getDayName(date: Date, short = true): string {
  return date.toLocaleDateString('en-US', { weekday: short ? 'short' : 'long' });
}

/**
 * Format date for display (e.g., "Dec 11")
 */
export function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format full date (e.g., "Wednesday, December 11, 2024")
 */
export function formatFullDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ═══════════════════════════════════════════════════════════
// DATE CALCULATIONS
// ═══════════════════════════════════════════════════════════

/**
 * Get today's date at midnight
 */
export function getToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Get date N days from today
 */
export function getDateFromToday(daysOffset: number): Date {
  const today = getToday();
  today.setDate(today.getDate() + daysOffset);
  return today;
}

/**
 * Generate array of dates for the board horizon (7 days by default)
 */
export function getDateHorizon(days = 7): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < days; i++) {
    dates.push(getDateFromToday(i));
  }
  return dates;
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Check if a date is today
 */
export function isToday(date: Date): boolean {
  return isSameDay(date, getToday());
}

/**
 * Check if a date is in the past (before today)
 */
export function isPast(date: Date): boolean {
  const today = getToday();
  return date < today;
}

/**
 * Check if a date is in the future (after today)
 */
export function isFuture(date: Date): boolean {
  const today = getToday();
  return date > today;
}

/**
 * Get days difference between two dates
 */
export function getDaysDiff(date1: Date, date2: Date): number {
  const diffTime = date1.getTime() - date2.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Get days until a date (negative if in past)
 */
export function getDaysUntil(date: Date): number {
  return getDaysDiff(date, getToday());
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Check if a date is a weekday (Mon-Fri)
 */
export function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6; // Not Sunday (0) or Saturday (6)
}

// ═══════════════════════════════════════════════════════════
// COLUMN HEADER HELPERS
// ═══════════════════════════════════════════════════════════

export interface DateColumn {
  date: Date;
  isoDate: string;
  dayName: string;
  displayDate: string;
  isToday: boolean;
  isWeekend: boolean;
}

/**
 * Generate column data for the board
 */
export function getDateColumns(days = 7): DateColumn[] {
  return getDateHorizon(days).map((date) => ({
    date,
    isoDate: toISODate(date),
    dayName: getDayName(date),
    displayDate: formatDisplayDate(date),
    isToday: isToday(date),
    isWeekend: date.getDay() === 0 || date.getDay() === 6,
  }));
}
