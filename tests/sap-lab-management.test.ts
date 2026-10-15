import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import {
  provisionSapAccess,
  extendSapAccess,
  revokeSapAccess,
  resetSapPassword,
  testSapConnection,
  generateSapGuiShortcutContent,
  syncSapAllocationExpirations,
  getSapAllocations,
  logSapCredentialAccess,
} from '@/lib/services/sap-lab-service';

describe('SAP Server Lab & Sandbox Allocation Tests', () => {
  const testStudentId = 'stu-01';
  const testSystemId = 'sap-sys-01';

  beforeEach(() => {
    // Reset test allocations
    store.sapAllocations = store.sapAllocations.filter(
      (a) => a.id !== 'alloc-test-unit-01' && a.student_id !== 'stu-unit-test'
    );
  });

  it('validates student and system existence when provisioning sandbox access', async () => {
    await expect(
      provisionSapAccess(
        {
          student_id: 'invalid-student-xyz',
          system_id: testSystemId,
        },
        'usr-admin-01'
      )
    ).rejects.toThrow('Student not found');

    await expect(
      provisionSapAccess(
        {
          student_id: testStudentId,
          system_id: 'invalid-sys-xyz',
        },
        'usr-admin-01'
      )
    ).rejects.toThrow('SAP Server System not found');
  });

  it('enforces server quota and prevents over-allocation beyond system capacity', async () => {
    const sys = store.sapSystems.find((s) => s.id === testSystemId);
    expect(sys).toBeDefined();

    // Temporarily set capacity to 1 (which is already reached by alloc-01)
    const originalCap = (sys as any).capacity;
    (sys as any).capacity = 1;

    // Attempting allocation beyond capacity
    await expect(
      provisionSapAccess(
        {
          student_id: 'stu-02',
          system_id: testSystemId,
        },
        'usr-admin-01'
      )
    ).rejects.toThrow(/maximum capacity/);

    // Restore capacity
    (sys as any).capacity = originalCap;
  });

  it('auto-expires allocations when validity date has passed', () => {
    const pastDate = '2025-01-01';
    store.sapAllocations.push({
      id: 'alloc-test-unit-01',
      student_id: 'stu-01',
      student_name: 'Test Student',
      admission_number: 'ADM-TEST-01',
      course_id: 'crs-fico-01',
      course_name: 'SAP FICO',
      system_id: testSystemId,
      system_name: 'SAP S/4HANA Finance Sandbox',
      server_host: '10.0.0.1',
      sid: 'S4H',
      instance_number: '00',
      client_number: '800',
      sap_user_id: 'SAP_TEST99',
      sap_password: 'Password#123',
      valid_from: '2024-10-01',
      valid_to: pastDate,
      status: 'Active',
      allocated_by: 'admin',
      created_at: '2024-10-01T00:00:00Z',
      updated_at: '2024-10-01T00:00:00Z',
    });

    const hadUpdates = syncSapAllocationExpirations();
    expect(hadUpdates).toBe(true);

    const testAlloc = store.sapAllocations.find((a) => a.id === 'alloc-test-unit-01');
    expect(testAlloc?.status).toBe('Expired');
  });

  it('resets SAP password with durable persistence and audit trail', async () => {
    const alloc = store.sapAllocations[0];
    expect(alloc).toBeDefined();

    const result = await resetSapPassword(alloc.id, 'NewSapPass#2026', 'usr-admin-01');
    expect(result.generatedPassword).toBe('NewSapPass#2026');
    expect(alloc.sap_password).toBe('NewSapPass#2026');

    // Audit log was recorded
    const audit = store.auditLogs.find(
      (log) => log.action === 'SAP_PASSWORD_RESET' && log.record_id === alloc.id
    );
    expect(audit).toBeDefined();
  });

  it('generates valid SAP GUI shortcut files including SAP router prefix when configured', () => {
    const alloc = store.sapAllocations[0];
    const sys = store.sapSystems.find((s) => s.id === alloc.system_id);
    if (sys) {
      sys.sap_router = '/H/router.company.com/S/3299/';
    }

    const shortcut = generateSapGuiShortcutContent(alloc);

    expect(shortcut).toContain('[System]');
    expect(shortcut).toContain(`Name=${alloc.sid}`);
    expect(shortcut).toContain(`Client=${alloc.client_number}`);
    expect(shortcut).toContain(`Name=${alloc.sap_user_id}`);
    expect(shortcut).toContain('Title=SAP Easy Access');
    expect(shortcut).toContain('Command=SESSION_MANAGER');
    expect(shortcut).toContain('GuiParm=');
    if (sys?.sap_router) {
      expect(shortcut).toContain('/H/router.company.com/S/3299/');
    }
  });

  it('tests connection latency for online systems and handles offline servers', async () => {
    const onlineResult = await testSapConnection(testSystemId);
    expect(onlineResult.success).toBe(true);
    expect(onlineResult.latencyMs).toBeGreaterThan(0);
    expect(onlineResult.message).toContain('online');

    // Mark system offline
    const sys = store.sapSystems.find((s) => s.id === testSystemId);
    if (sys) {
      const origStatus = sys.status;
      sys.status = 'Offline';

      const offlineResult = await testSapConnection(testSystemId);
      expect(offlineResult.success).toBe(false);
      expect(offlineResult.message).toContain('Offline');

      sys.status = origStatus;
    }
  });

  it('extends and revokes SAP access properly', async () => {
    const alloc = store.sapAllocations[0];
    const newDate = '2026-12-31';

    const extended = await extendSapAccess(alloc.id, newDate, 'usr-admin-01');
    expect(extended.valid_to).toBe(newDate);
    expect(extended.status).toBe('Active');

    const revoked = await revokeSapAccess(alloc.id, 'usr-admin-01');
    expect(revoked.status).toBe('Revoked');
  });

  it('records audit log when staff reveals or copies student SAP credentials', async () => {
    const alloc = store.sapAllocations[0];
    expect(alloc).toBeDefined();

    // 1. Password reveal audit
    await logSapCredentialAccess(alloc.id, 'REVEAL', 'usr-admin-01');
    const revealAudit = store.auditLogs.find(
      (log) =>
        log.action === 'SAP_CREDENTIALS_ACCESSED' &&
        log.record_id === alloc.id &&
        (log.new_value as any)?.access_type === 'REVEAL'
    );
    expect(revealAudit).toBeDefined();
    expect((revealAudit?.new_value as any)?.student_id).toBe(alloc.student_id);

    // 2. Password copy audit
    await logSapCredentialAccess(alloc.id, 'COPY_PASSWORD', 'usr-admin-01');
    const copyPassAudit = store.auditLogs.find(
      (log) =>
        log.action === 'SAP_CREDENTIALS_ACCESSED' &&
        log.record_id === alloc.id &&
        (log.new_value as any)?.access_type === 'COPY_PASSWORD'
    );
    expect(copyPassAudit).toBeDefined();

    // 3. User ID copy audit
    await logSapCredentialAccess(alloc.id, 'COPY_USER_ID', 'usr-admin-01');
    const copyUserAudit = store.auditLogs.find(
      (log) =>
        log.action === 'SAP_CREDENTIALS_ACCESSED' &&
        log.record_id === alloc.id &&
        (log.new_value as any)?.access_type === 'COPY_USER_ID'
    );
    expect(copyUserAudit).toBeDefined();
  });

  it('safely rejects provisioning when no SAP system matches or system is missing', async () => {
    const student = store.students[0];
    expect(student).toBeDefined();

    await expect(
      provisionSapAccess(
        {
          student_id: student.id,
          system_id: '',
        },
        'usr-admin-01'
      )
    ).rejects.toThrow('SAP Server System not found');
  });
});

