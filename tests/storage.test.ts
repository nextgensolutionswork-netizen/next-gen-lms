import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateFile,
  generateStoragePath,
  uploadFile,
  STORAGE_BUCKETS,
  getStoragePublicUrl,
  createSignedUrl,
  verifySignedUrlToken,
} from '@/lib/services/storage-service';
import { uploadStudentResume, getPlacementProfileForStudent } from '@/lib/services/placement-service';
import { createAssignment, submitAssignment } from '@/lib/services/academics-service';
import { store } from '@/lib/services/data-store';
import { NextRequest } from 'next/server';
import { POST as uploadRouteHandler } from '@/app/api/upload/route';
import { POST as createSignedUrlHandler } from '@/app/api/storage/signed-url/route';
import { GET as getSignedFileHandler } from '@/app/api/storage/signed/route';

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

    it('approves PDF and PNG attachments for doubt-attachments bucket', () => {
      const imgFile = {
        name: 'sap_gl_error_dump.png',
        size: 1.5 * 1024 * 1024,
        type: 'image/png',
      };
      expect(validateFile(imgFile, 'doubt-attachments').valid).toBe(true);

      const pdfFile = {
        name: 'configuration_steps.pdf',
        size: 3 * 1024 * 1024,
        type: 'application/pdf',
      };
      expect(validateFile(pdfFile, 'doubt-attachments').valid).toBe(true);
    });

    it('approves PDF receipt and rejects executable files in receipts bucket', () => {
      const receiptPdf = {
        name: 'fee_receipt_INV-9921.pdf',
        size: 500 * 1024,
        type: 'application/pdf',
      };
      expect(validateFile(receiptPdf, 'receipts').valid).toBe(true);

      const invalidFile = {
        name: 'script.sh',
        size: 10 * 1024,
        type: 'application/x-sh',
      };
      const res = validateFile(invalidFile, 'receipts');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Invalid file format');
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

  describe('Signed URL Generation & HMAC Verification', () => {
    it('generates cryptographic signed URL with expiration and signature token', async () => {
      const signedResult = await createSignedUrl('resumes', 'std-001/resume.pdf', 3600);
      expect(signedResult.signedUrl).toBeTruthy();
      expect(signedResult.token).toBeTruthy();
      expect(signedResult.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect(signedResult.signedUrl).toContain('bucket=resumes');
      expect(signedResult.signedUrl).toContain('signature=');
    });

    it('verifies valid signed URL token successfully within expiration window', () => {
      const path = 'std-001/resume.pdf';
      const expires = Math.floor(Date.now() / 1000) + 3600;
      const crypto = require('crypto');
      const secret = process.env.STORAGE_SIGNING_SECRET || 'erp_lms_secure_storage_token_2026';
      const sig = crypto.createHmac('sha256', secret).update(`resumes:${path}:${expires}`).digest('hex');

      const isValid = verifySignedUrlToken('resumes', path, expires, sig);
      expect(isValid).toBe(true);
    });

    it('rejects tampered signed URL tokens', () => {
      const path = 'std-001/resume.pdf';
      const expires = Math.floor(Date.now() / 1000) + 3600;
      const fakeSig = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

      const isValid = verifySignedUrlToken('resumes', path, expires, fakeSig);
      expect(isValid).toBe(false);
    });

    it('rejects expired signed URL tokens', () => {
      const path = 'std-001/resume.pdf';
      const expiredTime = Math.floor(Date.now() / 1000) - 5; // expired 5 seconds ago
      const crypto = require('crypto');
      const secret = process.env.STORAGE_SIGNING_SECRET || 'erp_lms_secure_storage_token_2026';
      const sig = crypto.createHmac('sha256', secret).update(`resumes:${path}:${expiredTime}`).digest('hex');

      const isValid = verifySignedUrlToken('resumes', path, expiredTime, sig);
      expect(isValid).toBe(false);
    });
  });

  describe('API Routes for Signed URLs (/api/storage/signed-url and /api/storage/signed)', () => {
    it('creates signed URL via POST /api/storage/signed-url', async () => {
      const req = new NextRequest('http://localhost:3000/api/storage/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucket: 'assignments',
          path: 'batch-01/assignment-spec.pdf',
          expiresInSeconds: 1800,
        }),
      });

      const res = await createSignedUrlHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.signedUrl).toContain('bucket=assignments');
      expect(data.token).toBeTruthy();
    });

    it('rejects request with missing bucket or path', async () => {
      const req = new NextRequest('http://localhost:3000/api/storage/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucket: 'assignments',
        }),
      });

      const res = await createSignedUrlHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
    });

    it('rejects GET /api/storage/signed without signature (400 Bad Request)', async () => {
      const req = new NextRequest('http://localhost:3000/api/storage/signed?bucket=resumes&path=std-001/cv.pdf', {
        method: 'GET',
      });

      const res = await getSignedFileHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('missing security parameters');
    });

    it('rejects GET /api/storage/signed with invalid signature (403 Forbidden)', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/storage/signed?bucket=resumes&path=std-001/cv.pdf&expires=' +
          (Math.floor(Date.now() / 1000) + 60) +
          '&signature=bad_signature',
        {
          method: 'GET',
        }
      );

      const res = await getSignedFileHandler(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Invalid or forged signed storage URL signature');
    });

    it('verifies and serves signed URL access via GET /api/storage/signed with valid signature', async () => {
      const signedRes = await createSignedUrl('resumes', 'std-001/resume.pdf', 3600);
      const req = new NextRequest(`http://localhost:3000${signedRes.signedUrl}`, {
        method: 'GET',
      });

      const res = await getSignedFileHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.verified).toBe(true);
    });
  });

  describe('Homework Submission with File Upload Integration', () => {
    it('creates an assignment with reference attachment and allows student homework submission with attachment', async () => {
      const asg = await createAssignment({
        title: 'F110 Automatic Payment Program Blueprint',
        description: 'Configure APP run and post bank transactions.',
        course_id: store.courses[0].id,
        batch_id: store.batches[0].id,
        due_date: '2026-04-15T23:59',
        maximum_marks: 100,
        attachment_url: 'https://supabase.co/storage/v1/object/public/assignments/batch-01/f110_spec.pdf',
        created_by: 'usr-trainer',
      });

      expect(asg.id).toBeTruthy();
      expect(asg.attachment_url).toContain('f110_spec.pdf');

      const studentId = store.students[0].id;
      const homeworkAttachment = 'https://supabase.co/storage/v1/object/public/assignments/std-001/my_f110_solution.zip';

      const submission = await submitAssignment(
        asg.id,
        studentId,
        'Completed configuration of company code and payment methods in F110.',
        homeworkAttachment
      );

      expect(submission.assignment_id).toBe(asg.id);
      expect(submission.student_id).toBe(studentId);
      expect(submission.attachment_url).toBe(homeworkAttachment);
      expect(submission.status).toBe('Submitted');

      const storedSub = store.submissions.find((s) => s.assignment_id === asg.id && s.student_id === studentId);
      expect(storedSub?.attachment_url).toBe(homeworkAttachment);
    });
  });
});
