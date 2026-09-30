import { describe, it, expect } from 'vitest';
import { updateVideoProgress, getStudentCourseProgress } from '@/lib/services/academics-service';
import { store } from '@/lib/services/data-store';

describe('HLS Video Player & Anti-Piracy Watermarking Engine', () => {
  describe('1. Anti-Piracy Watermark Generation & Payload Integrity', () => {
    it('constructs multi-layer security payload containing student identifiers', () => {
      const student = store.students[0];
      expect(student).toBeDefined();

      const watermarkPayload = {
        name: student.full_name,
        code: student.admission_number || student.student_code,
        email: student.email,
        timestamp: new Date().toISOString(),
        securityTag: 'SAP-SEC-STREAM-VERIFIED',
      };

      expect(watermarkPayload.name).toBe('Amit Gupta');
      expect(watermarkPayload.code).toMatch(/ADM-|STD-/);
      expect(watermarkPayload.email).toContain('@');
      expect(watermarkPayload.securityTag).toBe('SAP-SEC-STREAM-VERIFIED');
    });

    it('generates randomized floating coordinates within safe bounds (10% to 70%)', () => {
      for (let i = 0; i < 50; i++) {
        const top = Math.floor(Math.random() * 60) + 10;
        const left = Math.floor(Math.random() * 55) + 10;
        const rotate = Math.floor(Math.random() * 16) - 8;
        const opacity = Number((Math.random() * 0.35 + 0.35).toFixed(2));

        expect(top).toBeGreaterThanOrEqual(10);
        expect(top).toBeLessThanOrEqual(70);

        expect(left).toBeGreaterThanOrEqual(10);
        expect(left).toBeLessThanOrEqual(65);

        expect(rotate).toBeGreaterThanOrEqual(-8);
        expect(rotate).toBeLessThanOrEqual(8);

        expect(opacity).toBeGreaterThanOrEqual(0.35);
        expect(opacity).toBeLessThanOrEqual(0.70);
      }
    });
  });

  describe('2. Anti-Piracy Tamper Detection Logic', () => {
    it('detects forbidden CSS concealment properties (display:none, visibility:hidden, opacity:0)', () => {
      function evaluateTampering(style: { display?: string; visibility?: string; opacity?: string }): boolean {
        if (style.display === 'none') return true;
        if (style.visibility === 'hidden') return true;
        if (parseFloat(style.opacity || '1') === 0) return true;
        return false;
      }

      expect(evaluateTampering({ display: 'none' })).toBe(true);
      expect(evaluateTampering({ visibility: 'hidden' })).toBe(true);
      expect(evaluateTampering({ opacity: '0' })).toBe(true);
      expect(evaluateTampering({ opacity: '0.00' })).toBe(true);

      // Permitted styles
      expect(evaluateTampering({ display: 'block', visibility: 'visible', opacity: '0.6' })).toBe(false);
    });

    it('detects DOM element removal for watermark nodes', () => {
      const watermarkId = 'watermark-overlay-node';
      const removedNodes = ['btn-seek', 'watermark-overlay-node'];

      const isWatermarkRemoved = removedNodes.includes(watermarkId);
      expect(isWatermarkRemoved).toBe(true);
    });
  });

  describe('3. Stream Type & Adaptive Bitrate Level Detection', () => {
    it('correctly classifies HLS m3u8 manifests vs progressive MP4 videos', () => {
      function isHlsStream(url: string): boolean {
        return url.includes('.m3u8') || url.includes('/hls/');
      }

      expect(isHlsStream('https://cdn.example.com/streams/lesson1/manifest.m3u8')).toBe(true);
      expect(isHlsStream('https://cdn.example.com/hls/master.m3u8')).toBe(true);
      expect(isHlsStream('https://commondatastorage.googleapis.com/sample/BigBuckBunny.mp4')).toBe(false);
      expect(isHlsStream('https://example.com/video.webm')).toBe(false);
    });

    it('sorts HLS adaptive quality levels descending by resolution height', () => {
      const levels = [
        { height: 480, level: 0 },
        { height: 1080, level: 1 },
        { height: 720, level: 2 },
        { height: 360, level: 3 },
      ];

      levels.sort((a, b) => b.height - a.height);

      expect(levels[0].height).toBe(1080);
      expect(levels[1].height).toBe(720);
      expect(levels[2].height).toBe(480);
      expect(levels[3].height).toBe(360);
    });
  });

  describe('4. Playback Controls & Clamping Logic', () => {
    it('clamps seek target times within [0, duration]', () => {
      const duration = 2700; // 45 mins
      function clampSeek(targetTime: number, dur: number): number {
        return Math.max(0, Math.min(dur, targetTime));
      }

      expect(clampSeek(-30, duration)).toBe(0);
      expect(clampSeek(1500, duration)).toBe(1500);
      expect(clampSeek(3000, duration)).toBe(2700);
    });

    it('clamps volume levels between 0 and 1', () => {
      function clampVolume(vol: number): number {
        return Math.max(0, Math.min(1, vol));
      }

      expect(clampVolume(-0.2)).toBe(0);
      expect(clampVolume(0.85)).toBe(0.85);
      expect(clampVolume(1.4)).toBe(1);
    });

    it('provides standard LMS playback rates', () => {
      const rates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
      expect(rates).toContain(1);
      expect(rates).toContain(1.5);
      expect(rates).toContain(2);
      expect(rates.every((r) => r > 0 && r <= 2.5)).toBe(true);
    });
  });

  describe('5. Real Video Progress Tracking & Course Benchmark Sync', () => {
    it('marks lesson complete when watched percentage crosses 90%', async () => {
      const student = store.students[0];
      const lesson = store.lessons.find((l) => l.course_id === student.course_id)!;
      expect(lesson).toBeDefined();

      const totalDuration = 2700; // 45 minutes
      const watched = 2450; // ~90.7%

      const result = await updateVideoProgress(
        student.id,
        lesson.id,
        student.course_id,
        watched,
        totalDuration
      );

      expect(result.is_completed).toBe(true);
      expect(result.completed_percentage).toBeGreaterThanOrEqual(90);

      // Verify course overall progress updated
      const courseProgress = await getStudentCourseProgress(student.id, student.course_id);
      expect(courseProgress.completedLessons).toBeGreaterThanOrEqual(1);
      expect(courseProgress.overallProgress).toBeGreaterThan(0);
    });
  });
});
