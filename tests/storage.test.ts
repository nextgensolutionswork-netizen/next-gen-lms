import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateFile,
  generateStoragePath,
  uploadFile,
  STORAGE_BUCKETS,
  getStoragePublicUrl,
} from '@/lib/services/storage-service';
import { uploadStudentResume, getPlacementProfileForStudent } from '@/lib/services/placement-service';
import { store } from '@/lib/services/data-store';
import { NextRequest } from 'next/server';
import { POST as uploadRouteHandler } from '@/app/api/upload/route';

describe('9. Storage & File Upload Tests (Resumes, Screenshots, Assignments)', () => {
  beforeEach(() => {
    // Reset test student
    const student = store.students[0];
    if (student) {
      delete (student as any).resume_url;
    }
  });

  describe('File Validation', () => {
    it('approves valid PDF resume under size limit', () => {
      const file = {
        name: 'amit_gupta_cv.pdf',
        size: 2 * 1024 * 1024, // 2MB
        type: 'application/pdf',
      };
      const res = validateFile(file, 'resumes');
      expect(res.valid).toBe(true);
    });

    it('approves valid Word (.docx) resume', () => {
      const file = {
        name: 'resume_final.docx',
        size: 1 * 1024 * 1024,
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
      const res = validateFile(file, 'resumes');
      expect(res.valid).toBe(true);
    });

    it('rejects forbidden file extension (.exe) for resumes', () => {
      const file = {
        name: 'malicious_payload.exe',
        size: 500 * 1024,
        type: 'application/x-msdownload',
      };
      const res = validateFile(file, 'resumes');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Invalid file format');
    });

    it('rejects resume exceeding 10MB bucket limit', () => {
      const file = {
        name: 'huge_portfolio.pdf',
        size: 12 * 1024 * 1024, // 12MB
        type: 'application/pdf',
      };
      const res = validateFile(file, 'resumes');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('File size exceeds');
    });

    it('approves PNG screenshot attachment for doubts desk', () => {
      const file = {
        name: 'sap_gui_fb50_error.png',
        size: 800 * 1024,
        type: 'image/png',
      };
      const res = validateFile(file, 'screenshots');
      expect(res.valid).toBe(true);
    });

    it('approves ZIP project submission for assignments', () => {
      const file = {
        name: 'fico_configuration_workbook.zip',
        size: 15 * 1024 * 1024, // 15MB
        type: 'application/zip',
      };
      const res = validateFile(file, 'assignments');
      expect(res.valid).toBe(true);
    });
  });

  describe('Storage Path Generation', () => {
    it('generates a clean, scoped storage path with sanitized characters', () => {
      const path = generateStoragePath('resumes', 'My Resume @ 2026 #Final!.pdf', 'std-001');
      expect(path).toMatch(/^std-001\/\d+-my_resume_2026_final_.pdf$/);
    });

    it('defaults scope to general if entityId is omitted', () => {
      const path = generateStoragePath('screenshots', 'error.png');
      expect(path).toMatch(/^general\/\d+-error.png$/);
    });
  });

  describe('Upload File Execution & URL Resolution', () => {
    it('uploads a buffer or file and returns valid upload metadata and URL', async () => {
      const dummyBuffer = Buffer.from('Mock PDF Content for Amit Gupta Resume');
      const result = await uploadFile({
        bucket: 'resumes',
        file: dummyBuffer,
        fileName: 'amit_gupta_resume.pdf',
        contentType: 'application/pdf',
        entityId: 'std-001',
      });

      expect(result.fileName).toBe('amit_gupta_resume.pdf');
      expect(result.size).toBe(dummyBuffer.length);
      expect(result.mimeType).toBe('application/pdf');
      expect(result.path).toContain('std-001');
      expect(result.url).toBeTruthy();
    });

    it('throws an error if attempting to upload invalid file', async () => {
      const dummyBuffer = Buffer.from('executable binary code');
      await expect(
        uploadFile({
          bucket: 'resumes',
          file: dummyBuffer,
          fileName: 'virus.exe',
          contentType: 'application/octet-stream',
        })
      ).rejects.toThrow(/Invalid file format/);
    });

    it('resolves public URL correctly', () => {
      const url = getStoragePublicUrl('resumes', 'std-001/resume.pdf');
      expect(url).toContain('resumes');
      expect(url).toContain('std-001/resume.pdf');
    });
  });

  describe('Placement Resume Workflow Integration', () => {
    it('updates student placement profile with new resume URL and Pending Review status', async () => {
      const studentId = store.students[0].id;
      const testResumeUrl = 'https://mock-storage.supabase.co/resumes/std-001/amit_gupta_resume.pdf';

      const updatedProfile = await uploadStudentResume(studentId, testResumeUrl, 'usr-placement');

      expect(updatedProfile.resume_url).toBe(testResumeUrl);
      expect(updatedProfile.resume_status).toBe('Pending Review');

      const profileInStore = await getPlacementProfileForStudent(studentId);
      expect(profileInStore?.resume_url).toBe(testResumeUrl);
      expect(profileInStore?.resume_status).toBe('Pending Review');
    });
  });

  describe('API Route /api/upload', () => {
    it('rejects request with no file attached', async () => {
      const formData = new FormData();
      formData.append('bucket', 'resumes');

      const req = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const res = await uploadRouteHandler(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('No file was provided');
    });

    it('rejects request with invalid bucket name', async () => {
      const blob = new Blob(['sample text'], { type: 'text/plain' });
      const file = new File([blob], 'test.txt', { type: 'text/plain' });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'non_existent_bucket');

      const req = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const res = await uploadRouteHandler(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('Invalid bucket');
    });
  });
});
