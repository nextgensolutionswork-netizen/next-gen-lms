import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  matchesCourseId,
  resolveCanonicalCourseUuid,
} from '@/lib/services/academics-service';
import { getStandardFeeForCourseAndTraining } from '@/lib/services/fee-config-service';
import { convertLeadToAdmission } from '@/lib/services/crm-service';
import { Lead, UserProfile } from '@/types';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('BUG-15: Fix Course Registry Across the Entire LMS', () => {
  beforeEach(() => {
    store.reconcileAuthoritativeCourses();
  });

  describe('1. Authoritative Course Registry & Four New Configured Training Courses', () => {
    it('should expose all 4 newly configured training courses with correct codes, prices, and UUIDs', async () => {
      const courses = await getCourses();

      const expectedNewCourses = [
        {
          code: 'SAP FICO 101',
          name: 'SAP FICO PERSONAL TRAINING',
          price: 35000,
          id: 'c1000000-0000-4000-a000-000000000101',
          category: 'SAP Functional',
        },
        {
          code: 'SAP FICO 102',
          name: 'SAP FICO NORMAL TRAINING',
          price: 28000,
          id: 'c1000000-0000-4000-a000-000000000102',
          category: 'SAP Functional',
        },
        {
          code: 'SAP MM 103',
          name: 'SAP MM PERSONAL TRAINING',
          price: 35000,
          id: 'c1000000-0000-4000-a000-000000000103',
          category: 'SAP Functional',
        },
        {
          code: 'SAP ABAP 104',
          name: 'SAP ABAP NORMAL TRAINING',
          price: 28000,
          id: 'c1000000-0000-4000-a000-000000000104',
          category: 'SAP Technical',
        },
      ];

      for (const expected of expectedNewCourses) {
        const found = courses.find((c) => c.course_code === expected.code);
        expect(found).toBeDefined();
        expect(found?.course_name).toBe(expected.name);
        expect(found?.price).toBe(expected.price);
        expect(found?.id).toBe(expected.id);
        expect(found?.status).toBe('Published');
        expect(found?.category).toBe(expected.category);
      }
    });

    it('should preserve all 4 legacy courses without losing student or financial references', async () => {
      const courses = await getCourses();
      const legacyCodes = ['SAP-FICO-2026', 'SAP-MM-2026', 'SAP-SD-2026', 'SAP-ABAP-2026'];
      const legacyIds = ['crs-fico-01', 'crs-mm-01', 'crs-sd-01', 'crs-abap-01'];

      for (let i = 0; i < legacyCodes.length; i++) {
        const found = courses.find((c) => c.course_code === legacyCodes[i]);
        expect(found).toBeDefined();
        expect(found?.id).toBe(legacyIds[i]);
        expect(found?.status).toBe('Published');
      }
    });

    it('should be idempotent: multiple reconciliations do not create duplicate records', () => {
      const initialCount = store.courses.length;
      store.reconcileAuthoritativeCourses();
      store.reconcileAuthoritativeCourses();
      expect(store.courses.length).toBe(initialCount);
    });
  });

  describe('2. Course Fee Calculation & Elimination of ₹45,000 Fallback', () => {
    it('should calculate exactly ₹28,000 when selecting SAP FICO Normal Training', async () => {
      const courses = await getCourses();
      const course = courses.find((c) => c.course_code === 'SAP FICO 102');
      expect(course).toBeDefined();

      const result = getStandardFeeForCourseAndTraining({
        courseId: course!.id,
        trainingCategory: 'Normal Training',
        selectedCourse: course,
        baselineFee: course?.price,
      });

      expect(result.standard_fee).toBe(28000);
    });

    it('should calculate exactly ₹35,000 when selecting SAP MM Personal Training', async () => {
      const courses = await getCourses();
      const course = courses.find((c) => c.course_code === 'SAP MM 103');
      expect(course).toBeDefined();

      const result = getStandardFeeForCourseAndTraining({
        courseId: course!.id,
        trainingCategory: 'Personal Training',
        selectedCourse: course,
        baselineFee: course?.price,
      });

      expect(result.standard_fee).toBe(35000);
    });

    it('should calculate exactly ₹28,000 when selecting SAP ABAP Normal Training', async () => {
      const courses = await getCourses();
      const course = courses.find((c) => c.course_code === 'SAP ABAP 104');
      expect(course).toBeDefined();

      const result = getStandardFeeForCourseAndTraining({
        courseId: course!.id,
        trainingCategory: 'Normal Training',
        selectedCourse: course,
        baselineFee: course?.price,
      });

      expect(result.standard_fee).toBe(28000);
    });

    it('should calculate exactly ₹35,000 when selecting SAP FICO Personal Training', async () => {
      const courses = await getCourses();
      const course = courses.find((c) => c.course_code === 'SAP FICO 101');
      expect(course).toBeDefined();

      const result = getStandardFeeForCourseAndTraining({
        courseId: course!.id,
        trainingCategory: 'Personal Training',
        selectedCourse: course,
        baselineFee: course?.price,
      });

      expect(result.standard_fee).toBe(35000);
    });

    it('should never silently use the fallback ₹45,000 fee when course is unknown or missing', () => {
      const resultUnknown = getStandardFeeForCourseAndTraining({
        courseId: 'non-existent-course-id',
        trainingCategory: 'Normal Training',
        selectedCourse: undefined,
        baselineFee: 0,
      });

      expect(resultUnknown.standard_fee).toBe(0);
      expect(resultUnknown.standard_fee).not.toBe(45000);
    });
  });

  describe('3. CRUD Operations & Database Safeguards', () => {
    it('createCourse() generates valid RFC 4122 v4 UUID and inserts course', async () => {
      const uniqueCode = `NEW-${Date.now().toString().slice(-6)}`;
      const created = await createCourse({
        course_name: `Automated Test Course ${uniqueCode}`,
        course_code: uniqueCode,
        description: 'Test description',
        duration_weeks: 10,
        category: 'SAP Functional',
        price: 32000,
        status: 'Published',
      });

      expect(created.id).toMatch(UUID_V4_REGEX);
      expect(created.course_code).toBe(uniqueCode);

      // Verify retrieval
      const retrieved = await getCourseById(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.course_name).toBe(`Automated Test Course ${uniqueCode}`);

      // Clean up
      store.courses = store.courses.filter((c) => c.id !== created.id);
    });

    it('createCourse() rejects duplicate course codes and duplicate names', async () => {
      await expect(
        createCourse({
          course_name: 'Unique Name',
          course_code: 'sap fico 101', // Duplicate of existing
          description: 'Desc',
          duration_weeks: 10,
          category: 'SAP Functional',
          price: 35000,
          status: 'Published',
        })
      ).rejects.toThrow(/already exists/i);

      await expect(
        createCourse({
          course_name: 'SAP FICO NORMAL TRAINING', // Duplicate of existing
          course_code: 'NEW-CODE-999',
          description: 'Desc',
          duration_weeks: 10,
          category: 'SAP Functional',
          price: 28000,
          status: 'Published',
        })
      ).rejects.toThrow(/already exists/i);
    });

    it('updateCourse() safely updates course fields and updates store', async () => {
      const uniqueCode = `UPD-${Date.now().toString().slice(-6)}`;
      const created = await createCourse({
        course_name: `Update Test ${uniqueCode}`,
        course_code: uniqueCode,
        description: 'Initial',
        duration_weeks: 8,
        category: 'SAP Functional',
        price: 30000,
        status: 'Draft',
      });

      const updated = await updateCourse(created.id, {
        price: 33000,
        status: 'Published',
      });

      expect(updated.price).toBe(33000);
      expect(updated.status).toBe('Published');

      // Clean up
      store.courses = store.courses.filter((c) => c.id !== created.id);
    });

    it('deleteCourse() rejects deletion if course has existing student or financial references', async () => {
      // crs-fico-01 has active student and admission references
      await expect(deleteCourse('crs-fico-01')).rejects.toThrow(/Cannot delete course.*active student, admission, batch, or financial references/i);
    });
  });

  describe('4. Cross-Module Consistency: CRM, Admissions, and Batches', () => {
    it('matchesCourseId() correctly matches legacy IDs and canonical UUIDs', () => {
      expect(matchesCourseId('crs-fico-01', 'c1000000-0000-0000-0000-000000000001')).toBe(true);
      expect(matchesCourseId('c1000000-0000-4000-a000-000000000101', 'SAP FICO 101')).toBe(true);
      expect(matchesCourseId('c1000000-0000-4000-a000-000000000102', 'c1000000-0000-4000-a000-000000000102')).toBe(true);
      expect(matchesCourseId('c1000000-0000-4000-a000-000000000101', 'c1000000-0000-4000-a000-000000000102')).toBe(false);
    });

    it('convertLeadToAdmission() resolves correct course and fee for new training course', () => {
      const mockLead: Lead = {
        id: 'lead-test-conv-01',
        lead_code: 'LEAD-2026-TEST',
        full_name: 'Test Candidate',
        email: 'candidate@example.com',
        country_code: '+91',
        phone: '9888877777',
        whatsapp_number: '9888877777',
        interested_course_id: 'c1000000-0000-4000-a000-000000000102', // SAP FICO NORMAL TRAINING
        counsellor_id: 'usr-counsellor',
        created_by: 'usr-counsellor',
        tenant_id: 'default',
        stage: 'Contacted',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.leads = store.leads.filter((l) => l.id !== mockLead.id);
      store.leads.push(mockLead);

      const mockActor: UserProfile = {
        id: 'usr-counsellor',
        email: 'counsellor@next-generpsolutions.com',
        full_name: 'Ananya Desai',
        role: 'admin',
        is_active: true,
        tenant_id: 'default',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { admissionPrefill } = convertLeadToAdmission(mockLead.id, mockActor);
      expect(admissionPrefill.course_id).toBe('c1000000-0000-4000-a000-000000000102');
      expect(admissionPrefill.course_fee).toBe(28000);

      store.leads = store.leads.filter((l) => l.id !== mockLead.id);
    });
  });

  describe('5. Persistence and Store Hydration Resilience', () => {
    it('should retain all 4 new training courses across store hydration and reconciliations', () => {
      store.reconcileAuthoritativeCourses();

      const newCodes = ['SAP FICO 101', 'SAP FICO 102', 'SAP MM 103', 'SAP ABAP 104'];
      for (const code of newCodes) {
        const found = store.courses.find((c) => c.course_code === code);
        expect(found).toBeDefined();
        expect(found?.status).toBe('Published');
        expect(found?.id).toMatch(UUID_V4_REGEX);
      }
    });
  });
});
