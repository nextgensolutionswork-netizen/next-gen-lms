import { getInstituteTimezone, getTodayInInstituteTimezone, isValidYMD } from './schedule-date';
import type { SapServerAllocation } from '@/types';

export type EffectiveSapAllocationStatus =
  | 'Active'
  | 'Expired'
  | 'Revoked'
  | 'Suspended'
  | 'Cancelled'
  | 'Future';

export interface EffectiveStatusOptions {
  referenceDate?: Date;
  timeZone?: string;
}

/**
 * Validates whether a date string is either a strict YYYY-MM-DD date or a valid ISO timestamp.
 */
function isValidDateOrTimestamp(val?: string | null): boolean {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return isValidYMD(trimmed);
  }
  const time = new Date(trimmed).getTime();
  return !isNaN(time);
}

/**
 * Computes the authoritative effective status for an SAP server allocation.
 *
 * Lifecycle & Precedence Rules:
 * 1. Explicit Administrative Action:
 *    If stored status is 'Revoked', 'Suspended', or 'Cancelled', administrative action takes
 *    precedence over all dates. A past valid_to does NOT override 'Revoked'.
 *
 * 2. Invalid or Missing Dates:
 *    If valid_to or valid_from is missing, empty, or unparseable, access cannot be granted.
 *    Follows strict security policy: returns 'Expired' (never silently grants Active access).
 *
 * 3. Inclusive Calendar Date vs Timestamp Expiry:
 *    - Date-only ('YYYY-MM-DD'): The valid_to date is an inclusive calendar date in the institute's
 *      configured timezone (Asia/Kolkata). Access remains valid throughout the entire day of valid_to
 *      (until 23:59:59.999). At 00:00:00 on the following day in Asia/Kolkata, access expires.
 *    - Exact Timestamp (contains 'T'): Expiry is evaluated at millisecond precision: now > new Date(valid_to).
 *
 * 4. Future-Start Entitlement:
 *    If current time/date is before valid_from, the allocation has not commenced yet: returns 'Future'.
 *
 * 5. Stored 'Expired' Status:
 *    If stored status is explicitly 'Expired', returns 'Expired'.
 *
 * 6. Active Entitlement:
 *    If within the validity window and not revoked, returns 'Active'.
 */
export function getEffectiveSapAllocationStatus(
  alloc: {
    status?: string | null;
    valid_from?: string | null;
    valid_to?: string | null;
  },
  options?: EffectiveStatusOptions
): EffectiveSapAllocationStatus {
  const storedStatus = alloc.status?.trim() || '';

  // 1. Administrative / Terminal status precedence
  if (storedStatus === 'Revoked') return 'Revoked';
  if (storedStatus === 'Suspended') return 'Suspended';
  if (storedStatus === 'Cancelled') return 'Cancelled';

  // 2. Missing or malformed dates check (strict policy: never silently grant active access)
  if (!isValidDateOrTimestamp(alloc.valid_from) || !isValidDateOrTimestamp(alloc.valid_to)) {
    return 'Expired';
  }

  const validFromStr = alloc.valid_from!.trim();
  const validToStr = alloc.valid_to!.trim();
  const refDate = options?.referenceDate || new Date();
  const timeZone = options?.timeZone || getInstituteTimezone();

  const isFromTimestamp = validFromStr.includes('T');
  const isToTimestamp = validToStr.includes('T');

  // 3. Expiry Check
  if (isToTimestamp) {
    const toMs = new Date(validToStr).getTime();
    if (isNaN(toMs) || refDate.getTime() > toMs) {
      return 'Expired';
    }
  } else {
    // Inclusive calendar date in institute's timezone:
    // If today's date in Asia/Kolkata is strictly greater than valid_to, the date has passed.
    const todayInTz = getTodayInInstituteTimezone(refDate, timeZone);
    if (todayInTz > validToStr) {
      return 'Expired';
    }
  }

  // 4. Future-Start Check
  if (isFromTimestamp) {
    const fromMs = new Date(validFromStr).getTime();
    if (!isNaN(fromMs) && refDate.getTime() < fromMs) {
      return 'Future';
    }
  } else {
    const todayInTz = getTodayInInstituteTimezone(refDate, timeZone);
    if (todayInTz < validFromStr) {
      return 'Future';
    }
  }

  // 5. Stored 'Expired'
  if (storedStatus === 'Expired') {
    return 'Expired';
  }

  // 6. Active
  return 'Active';
}

/**
 * Checks whether an allocation matches the selected status filter tab.
 * Uses the exact same effective-status rules.
 */
export function isAllocationMatchingFilter(
  alloc: SapServerAllocation,
  statusFilter: 'All' | 'Active' | 'Expired' | 'Revoked' | 'Future',
  options?: EffectiveStatusOptions
): boolean {
  if (statusFilter === 'All') return true;

  const effective = getEffectiveSapAllocationStatus(alloc, options);

  if (statusFilter === 'Active') {
    return effective === 'Active';
  }

  if (statusFilter === 'Expired') {
    return effective === 'Expired';
  }

  if (statusFilter === 'Revoked') {
    return effective === 'Revoked' || effective === 'Suspended' || effective === 'Cancelled';
  }

  if (statusFilter === 'Future') {
    return effective === 'Future';
  }

  return false;
}

export interface SapAllocationStatusCounts {
  all: number;
  active: number;
  expired: number;
  revoked: number;
  future: number;
}

/**
 * Aggregates summary counts for all status filter tabs using the unified effective-status engine.
 */
export function getSapAllocationStatusCounts(
  allocations: SapServerAllocation[],
  options?: EffectiveStatusOptions
): SapAllocationStatusCounts {
  let active = 0;
  let expired = 0;
  let revoked = 0;
  let future = 0;

  for (const alloc of allocations) {
    const eff = getEffectiveSapAllocationStatus(alloc, options);
    if (eff === 'Active') {
      active++;
    } else if (eff === 'Expired') {
      expired++;
    } else if (eff === 'Revoked' || eff === 'Suspended' || eff === 'Cancelled') {
      revoked++;
    } else if (eff === 'Future') {
      future++;
    }
  }

  return {
    all: allocations.length,
    active,
    expired,
    revoked,
    future,
  };
}

export interface SystemCapacityMetrics {
  activeCount: number;
  provisionedCount: number;
  expiredCount: number;
  maxCapacity: number;
  usagePercent: number;
  isAtCapacity: boolean;
}

/**
 * Computes SAP server infrastructure capacity metrics.
 *
 * Distinguishes between:
 * - Active Entitlements (activeCount): Allocations with effective status 'Active'.
 * - Provisioned SAP Accounts (provisionedCount): Allocations that have NOT been revoked, as their
 *   user accounts physically exist on the SAP host system until an administrator explicitly revokes them.
 * - System Quota Enforcement: Prevents over-allocation beyond system capacity based on provisioned accounts.
 */
export function getSystemCapacityMetrics(
  allocations: SapServerAllocation[],
  systemId: string,
  capacity: number = 50,
  options?: EffectiveStatusOptions
): SystemCapacityMetrics {
  const sysAllocations = allocations.filter((a) => a.system_id === systemId);

  let activeCount = 0;
  let provisionedCount = 0;
  let expiredCount = 0;

  for (const alloc of sysAllocations) {
    const eff = getEffectiveSapAllocationStatus(alloc, options);
    if (eff === 'Active') {
      activeCount++;
      provisionedCount++;
    } else if (eff === 'Expired') {
      expiredCount++;
      provisionedCount++; // Account still provisioned in SAP SU01 until revoked
    } else if (eff === 'Future') {
      provisionedCount++; // Pre-provisioned account
    }
    // Revoked / Suspended / Cancelled do NOT count as active or provisioned
  }

  const maxCapacity = capacity || 50;
  const usagePercent = Math.round((activeCount / maxCapacity) * 100);
  const isAtCapacity = provisionedCount >= maxCapacity;

  return {
    activeCount,
    provisionedCount,
    expiredCount,
    maxCapacity,
    usagePercent,
    isAtCapacity,
  };
}
