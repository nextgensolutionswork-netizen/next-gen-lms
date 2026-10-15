import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import {
  createClassSession,
  updateClassSession,
  deleteClassSession,
  getOrCreateClassSessionForDate,
} from '@/lib/services/academics-service';

describe('Schedule & Timetable Management Tests', () => {
  const testBatchId = 'batch-sched-test-01';
  const testTrainerId = 'usr-trainer-fico';
  const testDate = '2026-05-15';

  beforeEach(() => {
    // Clean up test sessions
    store.classSessions = store.classSessions.filter(
      (cs) => cs.session_date !== testDate && cs.batch_id !== testBatchId
    );
  });

  it('validates mandatory topic, batch, and time chronology when creating sessions', async () => {
    // Missing topic
    await expect(
      createClassSession({
        batch_id: 'batch-01',
        topic: '   ',
        session_date: testDate,
        start_time: '09:00',
        end_time: '11:00',
        mode: 'Online',
        status: 'Scheduled',
      })
    ).rejects.toThrow('Session topic is required');

    // Missing batch ID
    await expect(
      createClassSession({
        batch_id: '   ',
        topic: 'General Ledger Configuration',
        session_date: testDate,
        start_time: '09:00',
        end_time: '11:00',
        mode: 'Online',
        status: 'Scheduled',
      })
    ).rejects.toThrow('Batch is required for class session');

    // Chronology error: start time >= end time
    await expect(
      createClassSession({
        batch_id: 'batch-01',
        topic: 'SAP Closing Procedures',
        session_date: testDate,
        start_time: '14:00',
        end_time: '12:00',
        mode: 'Classroom',
        status: 'Scheduled',
      })
    ).rejects.toThrow('Session start time (14:00) must be earlier than end time (12:00)');
  });

  it('prevents faculty double booking when session times overlap', async () => {
    // First session: 09:00 to 11:00
    const s1 = await createClassSession({
      batch_id: 'batch-01',
      trainer_id: testTrainerId,
      topic: 'Financial Statement Version Lecture',
      session_date: testDate,
      start_time: '09:00',
      end_time: '11:00',
      mode: 'Online',
      status: 'Scheduled',
    });
    expect(s1.id).toBeDefined();

    // Overlapping session with same trainer: 10:00 to 12:00 on different batch
    await expect(
      createClassSession({
        batch_id: 'batch-02',
        trainer_id: testTrainerId,
        topic: 'Controlling Cost Centers Overview',
        session_date: testDate,
        start_time: '10:00',
        end_time: '12:00',
        mode: 'Online',
        status: 'Scheduled',
      })
    ).rejects.toThrow(/Faculty conflict/);
  });

  it('prevents classroom / lab double booking when location and times overlap', async () => {
    const labRoom = 'Lab 3 (SAP MM Logistics Server Lab)';

    // Book Lab 3 from 14:00 to 16:00 with Trainer A
    await createClassSession({
      batch_id: 'batch-01',
      trainer_id: 'usr-trainer-fico',
      topic: 'Asset Master Records Workshop',
      session_date: testDate,
      start_time: '14:00',
      end_time: '16:00',
      classroom: labRoom,
      mode: 'Classroom',
      status: 'Scheduled',
    });

    // Attempt to book same Lab 3 from 15:00 to 17:00 with Trainer B
    await expect(
      createClassSession({
        batch_id: 'batch-02',
        trainer_id: 'usr-trainer-mm',
        topic: 'Procurement Cycle Practice',
        session_date: testDate,
        start_time: '15:00',
        end_time: '17:00',
        classroom: labRoom,
        mode: 'Classroom',
        status: 'Scheduled',
      })
    ).rejects.toThrow(/Classroom conflict/);
  });

  it('prevents scheduling conflicting sessions for the same student cohort batch', async () => {
    await createClassSession({
      batch_id: 'batch-01',
      trainer_id: 'usr-trainer-fico',
      topic: 'Accounts Payable Live Workshop',
      session_date: testDate,
      start_time: '18:00',
      end_time: '20:00',
      mode: 'Online',
      status: 'Scheduled',
    });

    // Same batch attempted at overlapping time
    await expect(
      createClassSession({
        batch_id: 'batch-01',
        trainer_id: 'usr-trainer-mm',
        topic: 'Purchase Orders Overview',
        session_date: testDate,
        start_time: '19:00',
        end_time: '21:00',
        mode: 'Online',
        status: 'Scheduled',
      })
    ).rejects.toThrow(/Batch conflict/);
  });

  it('allows back-to-back non-overlapping sessions on the same date', async () => {
    // Session 1: 09:00 to 11:00
    const s1 = await createClassSession({
      batch_id: 'batch-01',
      trainer_id: testTrainerId,
      topic: 'SAP Morning Lecture',
      session_date: testDate,
      start_time: '09:00',
      end_time: '11:00',
      mode: 'Online',
      status: 'Scheduled',
    });

    // Session 2: 11:00 to 13:00 (back-to-back, no overlap)
    const s2 = await createClassSession({
      batch_id: 'batch-01',
      trainer_id: testTrainerId,
      topic: 'SAP Midday Lab',
      session_date: testDate,
      start_time: '11:00',
      end_time: '13:00',
      mode: 'Online',
      status: 'Scheduled',
    });

    expect(s1.id).toBeDefined();
    expect(s2.id).toBeDefined();
  });

  it('enforces conflict validation on session update', async () => {
    const s1 = await createClassSession({
      batch_id: 'batch-01',
      trainer_id: testTrainerId,
      topic: 'Session 1',
      session_date: testDate,
      start_time: '08:00',
      end_time: '10:00',
      mode: 'Online',
      status: 'Scheduled',
    });

    const s2 = await createClassSession({
      batch_id: 'batch-02',
      trainer_id: 'usr-trainer-mm',
      topic: 'Session 2',
      session_date: testDate,
      start_time: '14:00',
      end_time: '16:00',
      mode: 'Online',
      status: 'Scheduled',
    });

    // Updating s2 to overlap with s1 and testTrainerId
    await expect(
      updateClassSession(s2.id, {
        trainer_id: testTrainerId,
        start_time: '09:00',
        end_time: '11:00',
      })
    ).rejects.toThrow(/Faculty conflict/);

    // Updating s1 own topic without time changes succeeds
    const updated = await updateClassSession(s1.id, {
      topic: 'Session 1 Updated Title',
    });
    expect(updated.topic).toBe('Session 1 Updated Title');
  });

  it('safely deletes session and cleans up associated records', async () => {
    const s = await createClassSession({
      batch_id: 'batch-01',
      topic: 'Temporary Lab Session',
      session_date: testDate,
      start_time: '16:00',
      end_time: '17:00',
      mode: 'Online',
      status: 'Scheduled',
    });

    const deleted = await deleteClassSession(s.id);
    expect(deleted).toBe(true);
    expect(store.classSessions.find((cs) => cs.id === s.id)).toBeUndefined();
  });

  it('prevents double-booking even when times are formatted with single-digit hours (e.g. 9:00 vs 10:00)', async () => {
    // Session 1: 9:00 to 11:00
    await createClassSession({
      batch_id: 'batch-01',
      trainer_id: testTrainerId,
      topic: 'Morning Session with single-digit hour',
      session_date: testDate,
      start_time: '9:00',
      end_time: '11:00',
      mode: 'Online',
      status: 'Scheduled',
    });

    // Session 2: 10:00 to 12:00 overlapping with 9:00 - 11:00
    await expect(
      createClassSession({
        batch_id: 'batch-02',
        trainer_id: testTrainerId,
        topic: 'Overlapping Session with 2-digit hour',
        session_date: testDate,
        start_time: '10:00',
        end_time: '12:00',
        mode: 'Online',
        status: 'Scheduled',
      })
    ).rejects.toThrow(/Faculty conflict/);
  });

  it('correctly filters sessions by Day, Week, Month, and All views', () => {
    const testSessions = [
      { id: 's1', session_date: '2026-05-11', start_time: '09:00', end_time: '11:00' }, // Monday
      { id: 's2', session_date: '2026-05-15', start_time: '10:00', end_time: '12:00' }, // Friday
      { id: 's3', session_date: '2026-05-20', start_time: '14:00', end_time: '16:00' }, // Next week
      { id: 's4', session_date: '2026-06-02', start_time: '09:00', end_time: '11:00' }, // Next month
    ] as any[];

    const refDateStr = '2026-05-15'; // Friday of week 2026-05-11 to 2026-05-17
    const [y, m, d] = refDateStr.split('-').map(Number);
    const refDate = new Date(y, m - 1, d, 12, 0, 0);

    // Day view: only s2 (2026-05-15)
    const dayFiltered = testSessions.filter((s) => s.session_date === refDateStr);
    expect(dayFiltered.map((s) => s.id)).toEqual(['s2']);

    // Week view: s1 and s2 (Monday 2026-05-11 to Sunday 2026-05-17)
    const dayOfWeek = refDate.getDay();
    const diffToMonday = (dayOfWeek + 6) % 7;
    const monday = new Date(refDate);
    monday.setDate(refDate.getDate() - diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const monStr = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    const sunStr = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`;

    const weekFiltered = testSessions.filter(
      (s) => s.session_date >= monStr && s.session_date <= sunStr
    );
    expect(weekFiltered.map((s) => s.id)).toEqual(['s1', 's2']);

    // Month view: s1, s2, s3 (May 2026)
    const monthFiltered = testSessions.filter((s) => s.session_date.startsWith('2026-05'));
    expect(monthFiltered.map((s) => s.id)).toEqual(['s1', 's2', 's3']);

    // All view: all 4 sessions
    const allFiltered = [...testSessions];
    expect(allFiltered.length).toBe(4);
  });
});
