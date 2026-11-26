import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { acquireModalLock, attachDialogFocusTrap } from '@/components/ui/modal';
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
      activeElement: null,
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
      dispatchTab: (shiftKey = false) => {
        const event = {
          key: 'Tab',
          shiftKey,
          preventDefault: vi.fn(),
        } as unknown as KeyboardEvent;
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
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
  });

  it('wires sticky Modal footer on BulkImportModal so action buttons remain visible during long previews', () => {
    const src = readComponent('components/bulk-import-modal.tsx');
    expect(src).toContain('footer={');
  });

  it('maintains balanced scroll lock across Strict Mode double setup/cleanup and repeated open/close cycles', () => {
    document.body.style.overflow = 'auto';
    document.body.style.paddingRight = '4px';

    for (let i = 0; i < 3; i++) {
      // Simulate Strict Mode mount -> unmount -> remount
      const release1 = acquireModalLock(vi.fn());
      expect(document.body.style.overflow).toBe('hidden');
      release1();
      expect(document.body.style.overflow).toBe('auto');
      expect(document.body.style.paddingRight).toBe('4px');

      const release2 = acquireModalLock(vi.fn());
      expect(document.body.style.overflow).toBe('hidden');
      release2();
      expect(document.body.style.overflow).toBe('auto');
      expect(document.body.style.paddingRight).toBe('4px');
    }
  });

  it('traps Tab/Shift+Tab in topmost dialog and restores focus from child to parent dialog and then trigger', () => {
    const makeEl = (id: string) => {
      const el = {
        id,
        isConnected: true,
        hasAttribute: () => false,
        getAttribute: () => null,
        focus: vi.fn(() => {
          (document as unknown as { activeElement: unknown }).activeElement = el;
        }),
      };
      return el;
    };

    const triggerBtn = makeEl('trigger-btn');
    const pFirst = makeEl('parent-first');
    const pLast = makeEl('parent-last');
    const cFirst = makeEl('child-first');
    const cLast = makeEl('child-last');

    const parentDialog = {
      id: 'parent-dialog',
      contains: (node: unknown) => node === parentDialog || node === pFirst || node === pLast,
      querySelectorAll: () => [pFirst, pLast],
      focus: vi.fn(),
    } as unknown as HTMLElement;

    const childDialog = {
      id: 'child-dialog',
      contains: (node: unknown) => node === childDialog || node === cFirst || node === cLast,
      querySelectorAll: () => [cFirst, cLast],
      focus: vi.fn(),
    } as unknown as HTMLElement;

    (document as unknown as { activeElement: unknown }).activeElement = triggerBtn;
    const releaseParentTrap = attachDialogFocusTrap(parentDialog);
    expect(pFirst.focus).toHaveBeenCalledTimes(1);

    // Move focus to last element in parent, then open child dialog
    pLast.focus();
    const releaseChildTrap = attachDialogFocusTrap(childDialog);
    expect(cFirst.focus).toHaveBeenCalledTimes(1);

    // Shift+Tab from first element in child wraps to last element in child (does NOT touch parent)
    const tabBack = (window as unknown as { dispatchTab: (s: boolean) => KeyboardEvent }).dispatchTab(true);
    expect(tabBack.preventDefault).toHaveBeenCalledTimes(1);
    expect(cLast.focus).toHaveBeenCalledTimes(1);

    // Tab from last element in child wraps to first element in child
    const tabFwd = (window as unknown as { dispatchTab: (s: boolean) => KeyboardEvent }).dispatchTab(false);
    expect(tabFwd.preventDefault).toHaveBeenCalledTimes(1);
    expect(cFirst.focus).toHaveBeenCalledTimes(2);

    // Closing child restores focus to parent's pLast
    releaseChildTrap();
    expect(pLast.focus).toHaveBeenCalledTimes(2);

    // Closing parent restores focus to original triggerBtn
    releaseParentTrap();
    expect(triggerBtn.focus).toHaveBeenCalledTimes(1);
  });

  it('wires sticky Modal footers with preserved form associations on prioritized long-form business modals', () => {
    const leads = readComponent('app/(dashboard)/crm/leads/page.tsx');
    expect(leads).toContain('form="create-lead-form"');
    expect(leads).toContain('id="create-lead-form"');
    expect(leads).toContain('Confirm Admission & Create Profile');

    const admissions = readComponent('app/(dashboard)/admissions/page.tsx');
    expect(admissions).toContain('form="new-admission-form"');
    expect(admissions).toContain('id="new-admission-form"');

    const payments = readComponent('app/(dashboard)/accounts/payments/page.tsx');
    expect(payments).toContain('form="record-payment-form"');
    expect(payments).toContain('id="record-payment-form"');

    const expenses = readComponent('app/(dashboard)/accounts/expenses/page.tsx');
    expect(expenses).toContain('form="create-expense-form"');
    expect(expenses).toContain('id="create-expense-form"');

    const users = readComponent('app/(dashboard)/users/page.tsx');
    expect(users).toContain('form="create-user-form"');
    expect(users).toContain('id="create-user-form"');
  });
});
