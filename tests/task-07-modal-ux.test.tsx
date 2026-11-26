import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { acquireModalLock } from '@/components/ui/modal';
import { CustomDateRangePicker } from '@/components/ui/custom-date-range-picker';
import { QuizRunnerModal } from '@/components/portal/quiz-runner-modal';

const ROOT = process.cwd();

function readComponent(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

describe('TASK-07: Modal Scrolling, Whitespace, Responsive Layout & UX Optimization', () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;

  beforeEach(() => {
    const listeners = new Set<(e: KeyboardEvent) => void>();
    const bodyStyle = { overflow: '', paddingRight: '' };

    (globalThis as Record<string, unknown>).document = {
      body: { style: bodyStyle },
      documentElement: { clientWidth: 1265 },
    };

    (globalThis as Record<string, unknown>).window = {
      innerWidth: 1280,
      addEventListener: (_type: string, fn: (e: KeyboardEvent) => void) => listeners.add(fn),
      removeEventListener: (_type: string, fn: (e: KeyboardEvent) => void) => listeners.delete(fn),
      dispatchEscape: () => {
        const event = { key: 'Escape', stopPropagation: vi.fn() } as unknown as KeyboardEvent;
        for (const fn of Array.from(listeners)) {
          fn(event);
        }
        return event;
      },
    };
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).document = originalDocument;
    (globalThis as Record<string, unknown>).window = originalWindow;
  });

  it('reference-counts background scroll lock across nested modals, compensates scrollbar width, and routes Escape to topmost modal', () => {
    const onCloseParent = vi.fn();
    const onCloseChild = vi.fn();

    const releaseParent = acquireModalLock(onCloseParent);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.paddingRight).toBe('15px');

    const releaseChild = acquireModalLock(onCloseChild);
    expect(document.body.style.overflow).toBe('hidden');

    // Escape hits only topmost child modal
    (window as unknown as { dispatchEscape: () => void }).dispatchEscape();
    expect(onCloseChild).toHaveBeenCalledTimes(1);
    expect(onCloseParent).not.toHaveBeenCalled();

    // Closing child while parent remains open preserves body scroll lock
    releaseChild();
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.paddingRight).toBe('15px');

    // Next Escape hits parent modal
    (window as unknown as { dispatchEscape: () => void }).dispatchEscape();
    expect(onCloseParent).toHaveBeenCalledTimes(1);

    // Closing parent restores original body styles
    releaseParent();
    expect(document.body.style.overflow).toBe('');
    expect(document.body.style.paddingRight).toBe('');
  });

  it('enforces responsive dvh sizing, compact sticky header/footer, overscroll-contain, and unique ARIA IDs in Modal', () => {
    const src = readComponent('components/ui/modal.tsx');
    expect(src).toContain('React.useId()');
    expect(src).toContain('aria-modal="true"');
    expect(src).toContain('max-w-[calc(100vw-1.5rem)]');
    expect(src).toContain('max-h-[90vh] max-h-[90dvh]');
    expect(src).toContain('flex-1 min-h-0 p-4 sm:p-5 overflow-y-auto overscroll-contain');
    expect(src).toContain('footer?: React.ReactNode');
    expect(src).toContain('shrink-0 border-t border-slate-100');
    expect(src).toContain("'3xl'");
    expect(src).toContain("'4xl'");
  });

  it('renders CustomDateRangePicker with mobile width guard, 90dvh cap, overscroll-contain, and shared scroll lock', () => {
    const src = readComponent('components/ui/custom-date-range-picker.tsx');
    expect(src).toContain('useModalScrollLock(isOpen, onClose)');

    const html = renderToStaticMarkup(
      <CustomDateRangePicker
        isOpen={true}
        onClose={vi.fn()}
        currentRange={null}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(html).toContain('max-w-[calc(100vw-1.5rem)]');
    expect(html).toContain('max-h-[90dvh]');
    expect(html).toContain('overscroll-contain');
  });

  it('renders QuizRunnerModal with mobile width guard, 92dvh cap, overscroll-contain, and shared scroll lock', () => {
    const src = readComponent('components/portal/quiz-runner-modal.tsx');
    expect(src).toContain('useModalScrollLock(isOpen, onClose)');

    const html = renderToStaticMarkup(
      <QuizRunnerModal
        isOpen={true}
        courseId="c-1"
        studentId="s-1"
        onQuizCompleted={vi.fn()}
        quiz={{
          id: 'q-1',
          title: 'SAP FICO Readiness Quiz',
          time_limit_minutes: 15,
          passing_percentage: 70,
        } as unknown as React.ComponentProps<typeof QuizRunnerModal>['quiz']}
        questions={[
          {
            id: 'ques-1',
            quiz_id: 'q-1',
            question_text: 'Which transaction code posts a general ledger document?',
            option_a: 'FB50',
            option_b: 'MM01',
            option_c: 'VA01',
            option_d: 'ME21N',
            correct_option: 'A',
          } as unknown as React.ComponentProps<typeof QuizRunnerModal>['questions'][number],
        ]}
        onClose={vi.fn()}
      />
    );
    expect(html).toContain('max-w-[calc(100vw-1.5rem)]');
    expect(html).toContain('max-h-[92dvh]');
    expect(html).toContain('overscroll-contain');
  });

  it('wires sticky Modal footer on BulkImportModal so action buttons remain visible during long previews', () => {
    const src = readComponent('components/bulk-import-modal.tsx');
    expect(src).toContain('footer={');
  });
});
