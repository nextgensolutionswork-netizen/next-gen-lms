import { store } from '@/lib/services/data-store';
import { getInstituteTimezone } from '@/lib/utils/schedule-date';

export { getInstituteTimezone };

/**
 * Validates that a string has a valid date-time structure and represents
 * a valid, real calendar date and valid time.
 * Accepts ISO strings (with Z or +/-HH:mm offset) or local datetime-local format (YYYY-MM-DDTHH:mm).
 */
export function isValidDeadlineString(dateStr?: string | null): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const trimmed = dateStr.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return false;

  const [_, yStr, mStr, dStr, hStr, minStr] = match;
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const h = Number(hStr);
  const min = Number(minStr);

  if (isNaN(y) || isNaN(m) || isNaN(d) || isNaN(h) || isNaN(min)) return false;
  if (y < 2000 || y > 2100) return false;
  if (m < 1 || m > 12) return false;
  if (h < 0 || h > 23 || min < 0 || min > 59) return false;

  // Calendar days in month check (including leap years)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d < 1 || d > daysInMonth) return false;

  return true;
}

/**
 * Parses a deadline string into a real UTC Date object, interpreting local wall-clock
 * datetime strings (YYYY-MM-DDTHH:mm) as occurring within the institute's configured timezone.
 * Strings with explicit offsets or UTC indicators ('Z') are parsed directly.
 */
export function parseDeadlineInTimezone(
  dateStr?: string | null,
  timeZone: string = getInstituteTimezone()
): Date {
  if (!dateStr || !isValidDeadlineString(dateStr)) {
    return new Date(NaN);
  }

  const trimmed = dateStr.trim();

  // If explicit offset or Z is provided, parse directly
  if (/Z|[+-]\d{2}:?\d{2}$/i.test(trimmed)) {
    const directDate = new Date(trimmed);
    return isNaN(directDate.getTime()) ? new Date(NaN) : directDate;
  }

  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return new Date(NaN);

  const [_, yStr, mStr, dStr, hStr, minStr, secStr = '00'] = match;
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const h = Number(hStr);
  const min = Number(minStr);
  const sec = Number(secStr);

  // Derive UTC timestamp matching wall-clock time in timeZone
  const naiveUtc = new Date(Date.UTC(y, m - 1, d, h, min, sec));
  try {
    const invFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
    const parts = invFormatter.formatToParts(naiveUtc);
    const p: Record<string, string> = {};
    for (const part of parts) {
      p[part.type] = part.value;
    }
    const targetHour = Number(p.hour) === 24 ? 0 : Number(p.hour);
    const actualTzDate = new Date(
      Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), targetHour, Number(p.minute), Number(p.second))
    );
    const diff = naiveUtc.getTime() - actualTzDate.getTime();
    return new Date(naiveUtc.getTime() + diff);
  } catch {
    return naiveUtc;
  }
}

/**
 * Formats a Date or ISO string into YYYY-MM-DDTHH:mm representation in the specified
 * institute timezone, suitable for HTML <input type="datetime-local"> elements.
 */
export function formatDeadlineToInput(
  dateInput?: Date | string | null,
  timeZone: string = getInstituteTimezone()
): string {
  if (!dateInput) return '';

  let d: Date;
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (!trimmed) return '';
    // If it's already a local datetime without offset or Z and valid, keep it
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed) && isValidDeadlineString(trimmed)) {
      return trimmed;
    }
    d = parseDeadlineInTimezone(trimmed, timeZone);
  } else {
    d = dateInput;
  }

  if (isNaN(d.getTime())) return '';

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(d);
    const p: Record<string, string> = {};
    for (const part of parts) {
      p[part.type] = part.value;
    }
    const hr = p.hour === '24' ? '00' : p.hour;
    return `${p.year}-${p.month}-${p.day}T${hr}:${p.minute}`;
  } catch {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hr = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${mo}-${day}T${hr}:${mi}`;
  }
}

/**
 * Formats a Date or ISO string for user-facing display in the institute timezone.
 * Example: "14 Nov 2026, 06:30 PM"
 */
export function formatDeadlineToDisplay(
  dateInput?: Date | string | null,
  timeZone: string = getInstituteTimezone(),
  includeTimezoneLabel = false
): string {
  if (!dateInput) return '—';

  const d = typeof dateInput === 'string' ? parseDeadlineInTimezone(dateInput, timeZone) : dateInput;
  if (isNaN(d.getTime())) return typeof dateInput === 'string' ? dateInput : '—';

  try {
    const formatted = new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone,
    }).format(d);

    return includeTimezoneLabel ? `${formatted} (${timeZone})` : formatted;
  } catch {
    return d.toISOString();
  }
}

/**
 * Validates an assignment submission deadline string against publication policy:
 * 1. Must be provided (non-empty).
 * 2. Must be a valid calendar date and time.
 * 3. Must be in the future relative to the reference time unless allowPastDeadline is true.
 */
export function validateAssignmentDeadline(
  deadlineStr?: string | null,
  options?: {
    allowPastDeadline?: boolean;
    referenceDate?: Date;
    timeZone?: string;
  }
): {
  isValid: boolean;
  error?: string;
  parsedDate?: Date;
} {
  if (!deadlineStr || !deadlineStr.trim()) {
    return {
      isValid: false,
      error: 'Submission due date is required.',
    };
  }

  if (!isValidDeadlineString(deadlineStr)) {
    return {
      isValid: false,
      error: 'Please enter a valid submission deadline date and time.',
    };
  }

  const timeZone = options?.timeZone || getInstituteTimezone();
  const parsedDate = parseDeadlineInTimezone(deadlineStr, timeZone);

  if (isNaN(parsedDate.getTime())) {
    return {
      isValid: false,
      error: 'Please enter a valid submission deadline date and time.',
    };
  }

  const referenceDate = options?.referenceDate || new Date();

  // Enforce future deadline for publication unless backdating is explicitly allowed
  if (!options?.allowPastDeadline && parsedDate.getTime() <= referenceDate.getTime()) {
    return {
      isValid: false,
      error: 'Assignment deadline must be set to a future date and time.',
      parsedDate,
    };
  }

  return {
    isValid: true,
    parsedDate,
  };
}
