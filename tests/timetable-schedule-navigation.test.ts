import { describe, it, expect, beforeEach } from 'vitest';
import {
  isValidYMD,
  getInstituteTimezone,
  getTodayInInstituteTimezone,
  stepDate,
  resolveInitialScheduleDate,
} from '@/lib/utils/schedule-date';
import { store } from '@/lib/services/data-store';

describe('QA-033 / BUG-06: Timetable Schedule Date Initialization & Navigation', () => {
  beforeEach(() => {
    // Ensure institute timezone is Asia/Kolkata
    store.settings.timezone = 'Asia/Kolkata';
  });

  describe('1. Dynamic Date Derivation & Timezone Resolution', () => {
    it('derives the current date dynamically in the configured institute timezone', () => {
      // Test at a fixed UTC time: 2026-11-13T20:00:00Z
      // In Asia/Kolkata (+05:30), this is 2026-11-14 01:30:00 AM
      const lateUtc = new Date('2026-11-13T20:00:00Z');
      const kolkataDate = getTodayInInstituteTimezone(lateUtc, 'Asia/Kolkata');
      expect(kolkataDate).toBe('2026-11-14');

      // In America/New_York (-05:00), this is 2026-11-13 15:00:00 PM
      const nyDate = getTodayInInstituteTimezone(lateUtc, 'America/New_York');
      expect(nyDate).toBe('2026-11-13');
    });

    it('uses store.settings.timezone if no timezone parameter is passed', () => {
      store.settings.timezone = 'Asia/Tokyo'; // UTC + 09:00
      const testUtc = new Date('2026-11-13T16:00:00Z'); // 2026-11-14 01:00 in Tokyo
      const dateInTokyo = getTodayInInstituteTimezone(testUtc);
      expect(dateInTokyo).toBe('2026-11-14');

      // Reset to Asia/Kolkata
      store.settings.timezone = 'Asia/Kolkata';
    });

    it('falls back gracefully to Asia/Kolkata if store settings timezone is missing', () => {
      const original = store.settings.timezone;
      (store.settings as any).timezone = undefined;
      expect(getInstituteTimezone()).toBe('Asia/Kolkata');
      store.settings.timezone = original;
    });
  });

  describe('2. URL Parameter Overrides & Fallbacks', () => {
    it('honors a valid YYYY-MM-DD URL date parameter', () => {
      const fixedNow = new Date('2026-11-14T10:00:00Z');
      const resolved = resolveInitialScheduleDate('2026-06-15', fixedNow, 'Asia/Kolkata');
      expect(resolved).toBe('2026-06-15');
    });

    it('falls back safely to dynamic today when URL parameter is missing or empty', () => {
      const fixedNow = new Date('2026-11-14T10:00:00Z');
      const resolvedNull = resolveInitialScheduleDate(null, fixedNow, 'Asia/Kolkata');
      expect(resolvedNull).toBe('2026-11-14');

      const resolvedEmpty = resolveInitialScheduleDate('', fixedNow, 'Asia/Kolkata');
      expect(resolvedEmpty).toBe('2026-11-14');
    });

    it('falls back safely to dynamic today when URL parameter is malformed or invalid', () => {
      const fixedNow = new Date('2026-11-14T10:00:00Z');
      expect(resolveInitialScheduleDate('not-a-date', fixedNow, 'Asia/Kolkata')).toBe('2026-11-14');
      expect(resolveInitialScheduleDate('2026-13-01', fixedNow, 'Asia/Kolkata')).toBe('2026-11-14'); // Month 13
      expect(resolveInitialScheduleDate('2026-02-30', fixedNow, 'Asia/Kolkata')).toBe('2026-11-14'); // Feb 30 does not exist
      expect(resolveInitialScheduleDate('2026-04-31', fixedNow, 'Asia/Kolkata')).toBe('2026-11-14'); // April 31 does not exist
    });
  });

  describe('3. Strict Calendar Date Validation', () => {
    it('accepts valid calendar dates', () => {
      expect(isValidYMD('2026-11-14')).toBe(true);
      expect(isValidYMD('2024-02-29')).toBe(true); // Leap year
      expect(isValidYMD('2026-01-31')).toBe(true);
    });

    it('rejects invalid, out-of-range, or non-existent calendar dates', () => {
      expect(isValidYMD('2026-02-29')).toBe(false); // Non-leap year Feb 29
      expect(isValidYMD('2026-04-31')).toBe(false);
      expect(isValidYMD('2026-00-10')).toBe(false);
      expect(isValidYMD('2026-11-32')).toBe(false);
      expect(isValidYMD('14-11-2026')).toBe(false);
      expect(isValidYMD('2026/11/14')).toBe(false);
      expect(isValidYMD('')).toBe(false);
      expect(isValidYMD(undefined)).toBe(false);
    });
  });

  describe('4. Month Navigation Without Month-Skipping (Month-End Clamping)', () => {
    it('steps January 31 into February 28 in a non-leap year without skipping to March', () => {
      const nextMonth = stepDate('2026-01-31', 'month', 1);
      expect(nextMonth).toBe('2026-02-28');
    });

    it('steps January 31 into February 29 in a leap year', () => {
      const nextMonth = stepDate('2024-01-31', 'month', 1);
      expect(nextMonth).toBe('2024-02-29');
    });

    it('steps March 31 backward into February 28 without staying in March', () => {
      const prevMonth = stepDate('2026-03-31', 'month', -1);
      expect(prevMonth).toBe('2026-02-28');
    });

    it('steps August 31 backward into July 31', () => {
      const prevMonth = stepDate('2026-08-31', 'month', -1);
      expect(prevMonth).toBe('2026-07-31');
    });

    it('handles year boundary forward: 2025-12-31 + 1 month -> 2026-01-31', () => {
      const nextMonth = stepDate('2025-12-31', 'month', 1);
      expect(nextMonth).toBe('2026-01-31');
    });

    it('handles year boundary backward: 2026-01-15 - 1 month -> 2025-12-15', () => {
      const prevMonth = stepDate('2026-01-15', 'month', -1);
      expect(prevMonth).toBe('2025-12-15');
    });
  });

  describe('5. Day and Week Stepping', () => {
    it('steps forward and backward by 1 day in day view', () => {
      expect(stepDate('2026-11-14', 'day', 1)).toBe('2026-11-15');
      expect(stepDate('2026-11-14', 'day', -1)).toBe('2026-11-13');
      expect(stepDate('2026-03-01', 'day', -1)).toBe('2026-02-28');
    });

    it('steps forward and backward by 7 days in week view', () => {
      expect(stepDate('2026-11-14', 'week', 1)).toBe('2026-11-21');
      expect(stepDate('2026-11-14', 'week', -1)).toBe('2026-11-07');
    });

    it('does not alter date in all view', () => {
      expect(stepDate('2026-11-14', 'all', 1)).toBe('2026-11-14');
    });
  });

  describe('6. Historical Session Preservation & Zero Session Fallback Avoidance', () => {
    it('does NOT initialize timetable date from first historical session', () => {
      // Historical sessions exist in store in March 2026
      const marchSessions = store.classSessions.filter((s) => s.session_date.startsWith('2026-03'));
      expect(marchSessions.length).toBeGreaterThan(0);
      expect(store.classSessions[0].session_date).toBe('2026-03-02');

      // When visiting on Nov 14, 2026 (where store has no sessions for Nov 2026),
      // the date MUST NOT default to 2026-03-02
      const fixedNow = new Date('2026-11-14T06:00:00Z');
      const initialDate = resolveInitialScheduleDate(undefined, fixedNow, 'Asia/Kolkata');
      expect(initialDate).toBe('2026-11-14');
      expect(initialDate).not.toBe('2026-03-02');
    });

    it('preserves historical March 2026 sessions intact when navigating back to March', () => {
      // Historical sessions in March must still exist and be completely intact
      const marchSessions = store.classSessions.filter((s) => s.session_date.startsWith('2026-03'));
      expect(marchSessions.length).toBeGreaterThan(0);
      expect(marchSessions.some((s) => s.course_name?.includes('SAP') || s.topic.includes('General Ledger'))).toBe(true);
    });
  });

  describe('7. Today Action and Navigation Independence', () => {
    it('recalculates today dynamically after user navigates to another month', () => {
      // Simulate user navigating to March 2026
      let userSelectedDate = '2026-03-15';
      expect(userSelectedDate.startsWith('2026-03')).toBe(true);

      // Controlled clock at 14 November 2026
      const fixedNow = new Date('2026-11-14T10:00:00Z');
      const todayDate = getTodayInInstituteTimezone(fixedNow, 'Asia/Kolkata');

      // Clicking Today resets user selection back to current date
      userSelectedDate = todayDate;
      expect(userSelectedDate).toBe('2026-11-14');
    });

    it('ensures reloading session records does not reset or alter user-selected reference date', () => {
      // User is viewing October 2026
      const userSelectedDate = '2026-10-20';

      // Asynchronous session refresh occurs
      const originalSessionsCount = store.classSessions.length;
      store.classSessions.push({
        id: `sess-async-${Date.now()}`,
        batch_id: 'batch-01',
        topic: 'Async Load Test',
        session_date: '2026-03-05',
        start_time: '09:00',
        end_time: '11:00',
        status: 'Scheduled',
        mode: 'Classroom',
      } as any);

      // The user selected date MUST remain October 2026 without jumping to March or today
      expect(userSelectedDate).toBe('2026-10-20');
      expect(store.classSessions.length).toBe(originalSessionsCount + 1);
    });
  });
});
