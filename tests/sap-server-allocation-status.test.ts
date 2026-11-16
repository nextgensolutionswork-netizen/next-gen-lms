import { describe, it, expect, beforeEach } from 'vitest';
import {
  getEffectiveSapAllocationStatus,
  isAllocationMatchingFilter,
  getSapAllocationStatusCounts,
  getSystemCapacityMetrics,
  EffectiveSapAllocationStatus,
} from '@/lib/utils/sap-server-status';
import {
  syncSapAllocationExpirations,
  getAllocationForStudent,
  provisionSapAccess,
} from '@/lib/services/sap-lab-service';
import { store } from '@/lib/services/data-store';
import { SapServerAllocation } from '@/types';

describe('BUG-08: SAP Server Allocation Effective Status & Filter Alignment', () => {
  const baseAllocation: SapServerAllocation = {
    id: 'alloc-test-bug08',
    student_id: 'stu-bug08',
    student_name: 'Harsh Vardhan',
    admission_number: 'ADM-2026-SAP01',
    course_id: 'crs-fico-01',
    course_name: 'SAP S/4HANA Finance',
    system_id: 'sap-sys-01',
    system_name: 'SAP S/4HANA Finance Sandbox',
    server_host: '10.0.0.1',
    sid: 'S4H',
    instance_number: '00',
    client_number: '800',
    sap_user_id: 'SAP_HARSH01',
    sap_password: 'Password#123',
    valid_from: '2026-11-01',
    valid_to: '2026-11-10',
    status: 'Active', // Stored status is Active, but valid_to has elapsed
    allocated_by: 'usr-admin-01',
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  };

  const fixedRefDate = new Date('2026-11-16T12:00:00+05:30'); // Nov 16, 2026 in Asia/Kolkata

  // 1. Stored Active status with elapsed expiry
  it('Scenario 1: Evaluates allocation with stored Active status but elapsed valid_to as Expired', () => {
    const alloc: SapServerAllocation = { ...baseAllocation, status: 'Active', valid_to: '2026-11-10' };

    const effectiveStatus = getEffectiveSapAllocationStatus(alloc, { referenceDate: fixedRefDate });
    expect(effectiveStatus).toBe('Expired');

    // Filter verification
    expect(isAllocationMatchingFilter(alloc, 'Expired', { referenceDate: fixedRefDate })).toBe(true);
    expect(isAllocationMatchingFilter(alloc, 'Active', { referenceDate: fixedRefDate })).toBe(false);
  });

  // 2. Genuinely active allocation
  it('Scenario 2: Evaluates genuinely active allocation within valid window as Active', () => {
    const alloc: SapServerAllocation = {
      ...baseAllocation,
      valid_from: '2026-11-01',
      valid_to: '2026-11-30',
      status: 'Active',
    };

    const effectiveStatus = getEffectiveSapAllocationStatus(alloc, { referenceDate: fixedRefDate });
    expect(effectiveStatus).toBe('Active');

    expect(isAllocationMatchingFilter(alloc, 'Active', { referenceDate: fixedRefDate })).toBe(true);
    expect(isAllocationMatchingFilter(alloc, 'Expired', { referenceDate: fixedRefDate })).toBe(false);
  });

  // 3. Immediately before, at, and after the expiry boundary
  describe('Scenario 3: Boundary conditions (inclusive calendar date & timestamp precision)', () => {
    it('Date-only boundary: valid_to is inclusive throughout the entire calendar day in Asia/Kolkata', () => {
      const alloc: SapServerAllocation = {
        ...baseAllocation,
        valid_from: '2026-11-01',
        valid_to: '2026-11-16',
        status: 'Active',
      };

      // Morning of 2026-11-16 in IST -> Active
      const morningIST = new Date('2026-11-16T09:00:00+05:30');
      expect(getEffectiveSapAllocationStatus(alloc, { referenceDate: morningIST })).toBe('Active');

      // 23:59:59 of 2026-11-16 in IST -> Still Active (inclusive day)
      const endOfDayIST = new Date('2026-11-16T23:59:59+05:30');
      expect(getEffectiveSapAllocationStatus(alloc, { referenceDate: endOfDayIST })).toBe('Active');

      // Next day 00:00:01 of 2026-11-17 in IST -> Expired
      const nextDayIST = new Date('2026-11-17T00:00:01+05:30');
      expect(getEffectiveSapAllocationStatus(alloc, { referenceDate: nextDayIST })).toBe('Expired');
    });

    it('Timestamp boundary: millisecond precision expiry', () => {
      const alloc: SapServerAllocation = {
        ...baseAllocation,
        valid_from: '2026-11-01T00:00:00.000Z',
        valid_to: '2026-11-16T15:00:00.000Z',
        status: 'Active',
      };

      const beforeMs = new Date('2026-11-16T14:59:59.000Z');
      const afterMs = new Date('2026-11-16T15:00:01.000Z');

      expect(getEffectiveSapAllocationStatus(alloc, { referenceDate: beforeMs })).toBe('Active');
      expect(getEffectiveSapAllocationStatus(alloc, { referenceDate: afterMs })).toBe('Expired');
    });
  });

  // 4. Institute timezone date differing from UTC
  it('Scenario 4: Correctly evaluates expiry when UTC date differs from Asia/Kolkata calendar date', () => {
    // 2026-11-15T20:00:00Z in UTC is 2026-11-16T01:30:00+05:30 in Asia/Kolkata (Date is Nov 16 in IST, Nov 15 in UTC)
    const lateUtcTime = new Date('2026-11-15T20:00:00.000Z');

    // Allocation valid through 2026-11-15: in UTC it might look valid, but in Asia/Kolkata it is already Nov 16!
    const allocExpiring15th: SapServerAllocation = {
      ...baseAllocation,
      valid_from: '2026-11-01',
      valid_to: '2026-11-15',
      status: 'Active',
    };

    expect(
      getEffectiveSapAllocationStatus(allocExpiring15th, {
        referenceDate: lateUtcTime,
        timeZone: 'Asia/Kolkata',
      })
    ).toBe('Expired');

    // Allocation starting on 2026-11-16: in UTC it would be future, but in Asia/Kolkata Nov 16 has started!
    const allocStarting16th: SapServerAllocation = {
      ...baseAllocation,
      valid_from: '2026-11-16',
      valid_to: '2026-11-30',
      status: 'Active',
    };

    expect(
      getEffectiveSapAllocationStatus(allocStarting16th, {
        referenceDate: lateUtcTime,
        timeZone: 'Asia/Kolkata',
      })
    ).toBe('Active');
  });

  // 5. Future-start allocations
  it('Scenario 5: Identifies future allocations when valid_from is in the future', () => {
    const futureAlloc: SapServerAllocation = {
      ...baseAllocation,
      valid_from: '2026-12-01',
      valid_to: '2026-12-31',
      status: 'Active',
    };

    const status = getEffectiveSapAllocationStatus(futureAlloc, { referenceDate: fixedRefDate });
    expect(status).toBe('Future');

    expect(isAllocationMatchingFilter(futureAlloc, 'Active', { referenceDate: fixedRefDate })).toBe(false);
    expect(isAllocationMatchingFilter(futureAlloc, 'Expired', { referenceDate: fixedRefDate })).toBe(false);
    expect(isAllocationMatchingFilter(futureAlloc, 'Future', { referenceDate: fixedRefDate })).toBe(true);
  });

  // 6. Revoked / Suspended / Cancelled state precedence
  it('Scenario 6: Preserves terminal and administrative status precedence regardless of dates', () => {
    // Past date but Revoked -> Must remain Revoked, NOT Expired
    const revokedAlloc: SapServerAllocation = {
      ...baseAllocation,
      valid_from: '2024-01-01',
      valid_to: '2024-06-01',
      status: 'Revoked',
    };
    expect(getEffectiveSapAllocationStatus(revokedAlloc, { referenceDate: fixedRefDate })).toBe('Revoked');
    expect(isAllocationMatchingFilter(revokedAlloc, 'Revoked', { referenceDate: fixedRefDate })).toBe(true);
    expect(isAllocationMatchingFilter(revokedAlloc, 'Expired', { referenceDate: fixedRefDate })).toBe(false);

    // Active date window but Suspended -> Must remain Suspended
    const suspendedAlloc: SapServerAllocation = {
      ...baseAllocation,
      valid_from: '2026-11-01',
      valid_to: '2026-11-30',
      status: 'Suspended',
    };
    expect(getEffectiveSapAllocationStatus(suspendedAlloc, { referenceDate: fixedRefDate })).toBe('Suspended');
    expect(isAllocationMatchingFilter(suspendedAlloc, 'Revoked', { referenceDate: fixedRefDate })).toBe(true);

    // Cancelled status
    const cancelledAlloc: SapServerAllocation = {
      ...baseAllocation,
      valid_from: '2026-11-01',
      valid_to: '2026-11-30',
      status: 'Cancelled',
    };
    expect(getEffectiveSapAllocationStatus(cancelledAlloc, { referenceDate: fixedRefDate })).toBe('Cancelled');
    expect(isAllocationMatchingFilter(cancelledAlloc, 'Revoked', { referenceDate: fixedRefDate })).toBe(true);
  });

  // 7. Missing or malformed dates (fails closed safely)
  it('Scenario 7: Fails closed safely to Expired on missing, empty, or malformed dates', () => {
    const invalidCases = [
      { valid_from: null, valid_to: '2026-11-30' },
      { valid_from: '2026-11-01', valid_to: null },
      { valid_from: '', valid_to: '2026-11-30' },
      { valid_from: '2026-11-01', valid_to: '' },
      { valid_from: 'not-a-date', valid_to: '2026-11-30' },
      { valid_from: '2026-11-01', valid_to: 'invalid-date' },
      { valid_from: '2026-02-31', valid_to: '2026-11-30' }, // invalid calendar date
    ];

    for (const testCase of invalidCases) {
      const alloc = {
        ...baseAllocation,
        valid_from: testCase.valid_from as any,
        valid_to: testCase.valid_to as any,
        status: 'Active',
      };
      const status = getEffectiveSapAllocationStatus(alloc, { referenceDate: fixedRefDate });
      expect(status).toBe('Expired');
    }
  });

  // 8. Badge, filter, and count agreement across the full dataset
  it('Scenario 8: Guarantees strict agreement between badges, filters, and status counts', () => {
    const dataset: SapServerAllocation[] = [
      // 1. Genuinely active
      { ...baseAllocation, id: 'a1', status: 'Active', valid_from: '2026-11-01', valid_to: '2026-11-30' },
      // 2. Stored Active but lapsed expiry (BUG-08 trigger case)
      { ...baseAllocation, id: 'a2', status: 'Active', valid_from: '2026-10-01', valid_to: '2026-11-10' },
      // 3. Stored Expired
      { ...baseAllocation, id: 'a3', status: 'Expired', valid_from: '2026-01-01', valid_to: '2026-04-01' },
      // 4. Revoked with past date
      { ...baseAllocation, id: 'a4', status: 'Revoked', valid_from: '2025-01-01', valid_to: '2025-06-01' },
      // 5. Future start
      { ...baseAllocation, id: 'a5', status: 'Active', valid_from: '2026-12-01', valid_to: '2026-12-31' },
    ];

    const counts = getSapAllocationStatusCounts(dataset, { referenceDate: fixedRefDate });
    expect(counts.all).toBe(5);
    expect(counts.active).toBe(1);
    expect(counts.expired).toBe(2); // a2 and a3
    expect(counts.revoked).toBe(1); // a4
    expect(counts.future).toBe(1);  // a5
    expect(counts.active + counts.expired + counts.revoked + counts.future).toBe(counts.all);

    // Verify filter matching matches counts exactly
    const activeFiltered = dataset.filter((a) => isAllocationMatchingFilter(a, 'Active', { referenceDate: fixedRefDate }));
    expect(activeFiltered.length).toBe(counts.active);
    expect(activeFiltered[0].id).toBe('a1');

    const expiredFiltered = dataset.filter((a) => isAllocationMatchingFilter(a, 'Expired', { referenceDate: fixedRefDate }));
    expect(expiredFiltered.length).toBe(counts.expired);
    expect(expiredFiltered.map((a) => a.id).sort()).toEqual(['a2', 'a3']);

    const revokedFiltered = dataset.filter((a) => isAllocationMatchingFilter(a, 'Revoked', { referenceDate: fixedRefDate }));
    expect(revokedFiltered.length).toBe(counts.revoked);
    expect(revokedFiltered[0].id).toBe('a4');
  });

  // 9. Time-dependent refresh when clock crosses expiry
  it('Scenario 9: Recomputes effective status dynamically when simulated clock crosses expiry boundary', () => {
    const alloc: SapServerAllocation = {
      ...baseAllocation,
      valid_from: '2026-11-01',
      valid_to: '2026-11-16',
      status: 'Active',
    };

    // Before midnight Nov 16
    const t0 = new Date('2026-11-16T23:50:00+05:30');
    expect(getEffectiveSapAllocationStatus(alloc, { referenceDate: t0 })).toBe('Active');
    expect(isAllocationMatchingFilter(alloc, 'Active', { referenceDate: t0 })).toBe(true);
    expect(isAllocationMatchingFilter(alloc, 'Expired', { referenceDate: t0 })).toBe(false);

    // After midnight Nov 17
    const t1 = new Date('2026-11-17T00:05:00+05:30');
    expect(getEffectiveSapAllocationStatus(alloc, { referenceDate: t1 })).toBe('Expired');
    expect(isAllocationMatchingFilter(alloc, 'Active', { referenceDate: t1 })).toBe(false);
    expect(isAllocationMatchingFilter(alloc, 'Expired', { referenceDate: t1 })).toBe(true);

    // Summary counts transition
    const countsBefore = getSapAllocationStatusCounts([alloc], { referenceDate: t0 });
    expect(countsBefore.active).toBe(1);
    expect(countsBefore.expired).toBe(0);

    const countsAfter = getSapAllocationStatusCounts([alloc], { referenceDate: t1 });
    expect(countsAfter.active).toBe(0);
    expect(countsAfter.expired).toBe(1);
  });

  // 10. Access-enforcement & capacity quota checks
  describe('Scenario 10: Access-enforcement and capacity quota semantics', () => {
    it('Distinguishes active entitlements from provisioned SAP accounts in capacity metrics', () => {
      const systemId = 'sap-sys-cap-test';
      const allocs: SapServerAllocation[] = [
        // Active entitlement & provisioned
        { ...baseAllocation, id: 'c1', system_id: systemId, status: 'Active', valid_from: '2026-11-01', valid_to: '2026-11-30' },
        // Expired entitlement, but still provisioned on host until revoked
        { ...baseAllocation, id: 'c2', system_id: systemId, status: 'Active', valid_from: '2026-10-01', valid_to: '2026-11-10' },
        // Revoked: unprovisioned / released capacity
        { ...baseAllocation, id: 'c3', system_id: systemId, status: 'Revoked', valid_from: '2026-09-01', valid_to: '2026-11-30' },
      ];

      const metrics = getSystemCapacityMetrics(allocs, systemId, 5, { referenceDate: fixedRefDate });
      expect(metrics.activeCount).toBe(1);
      expect(metrics.expiredCount).toBe(1);
      expect(metrics.provisionedCount).toBe(2); // c1 + c2
      expect(metrics.maxCapacity).toBe(5);
      expect(metrics.isAtCapacity).toBe(false);
    });

    it('syncSapAllocationExpirations synchronizes stored state cleanly with effective status', () => {
      const pastAllocId = 'alloc-sync-test-99';
      store.sapAllocations = store.sapAllocations.filter((a) => a.id !== pastAllocId);
      store.sapAllocations.push({
        ...baseAllocation,
        id: pastAllocId,
        valid_to: '2026-11-10',
        status: 'Active',
      });

      const updated = syncSapAllocationExpirations(fixedRefDate);
      expect(updated).toBe(true);

      const synced = store.sapAllocations.find((a) => a.id === pastAllocId);
      expect(synced?.status).toBe('Expired');
    });
  });
});
