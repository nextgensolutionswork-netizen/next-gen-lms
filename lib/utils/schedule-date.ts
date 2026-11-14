import { store } from '@/lib/services/data-store';

/**
 * Validates that a string is a strict and real calendar date in YYYY-MM-DD format.
 */
export function isValidYMD(dateStr?: string | null): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;

  const [y, m, d] = dateStr.split('-').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;

  const testDate = new Date(y, m - 1, d, 12, 0, 0);
  return (
    testDate.getFullYear() === y &&
    testDate.getMonth() === m - 1 &&
    testDate.getDate() === d
  );
}

/**
 * Retrieves the configured institute timezone, defaulting to 'Asia/Kolkata'.
 */
export function getInstituteTimezone(): string {
  try {
    return store.settings?.timezone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

/**
 * Derives today's date formatted as YYYY-MM-DD in the institute's configured timezone.
 * Uses 'en-CA' locale which outputs ISO standard YYYY-MM-DD.
 */
export function getTodayInInstituteTimezone(
  now: Date = new Date(),
  timeZone: string = getInstituteTimezone()
): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(now);
  } catch {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

/**
 * Safely steps a reference date forward or backward by day, week, or month.
 * For month navigation, target month is explicitly calculated and clamped to the
 * maximum days of that target month (e.g. Jan 31 -> Feb 28/29), preventing JS Date month-skipping.
 */
export function stepDate(
  referenceDate: string,
  view: 'day' | 'week' | 'month' | 'all',
  delta: number
): string {
  if (view === 'all' || delta === 0) return referenceDate;

  if (!isValidYMD(referenceDate)) {
    referenceDate = getTodayInInstituteTimezone();
  }

  const [y, m, d] = referenceDate.split('-').map(Number);

  if (view === 'day') {
    const dt = new Date(y, m - 1, d + delta, 12, 0, 0);
    const ry = dt.getFullYear();
    const rm = String(dt.getMonth() + 1).padStart(2, '0');
    const rd = String(dt.getDate()).padStart(2, '0');
    return `${ry}-${rm}-${rd}`;
  }

  if (view === 'week') {
    const dt = new Date(y, m - 1, d + delta * 7, 12, 0, 0);
    const ry = dt.getFullYear();
    const rm = String(dt.getMonth() + 1).padStart(2, '0');
    const rd = String(dt.getDate()).padStart(2, '0');
    return `${ry}-${rm}-${rd}`;
  }

  // Month navigation:
  // Convert year and 0-indexed month into continuous month count
  const totalMonths = y * 12 + (m - 1) + delta;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth0 = ((totalMonths % 12) + 12) % 12; // 0..11
  const targetMonth = targetMonth0 + 1; // 1..12

  // Find max days in target month: passing 0 as day returns last day of targetMonth
  const maxDays = new Date(targetYear, targetMonth, 0).getDate();
  const targetDay = Math.min(d, maxDays);

  const ry = targetYear;
  const rm = String(targetMonth).padStart(2, '0');
  const rd = String(targetDay).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
}

/**
 * Resolves the initial schedule reference date.
 * If a valid URL override parameter (YYYY-MM-DD) is provided, it is honored.
 * Otherwise, dynamically defaults to today in the institute's configured timezone.
 * Never defaults to historical session dates or hardcoded dates.
 */
export function resolveInitialScheduleDate(
  searchParamsDate?: string | null,
  now: Date = new Date(),
  timeZone?: string
): string {
  if (searchParamsDate && isValidYMD(searchParamsDate)) {
    return searchParamsDate;
  }
  return getTodayInInstituteTimezone(now, timeZone);
}
