'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// Reference-counted background scroll lock & topmost Escape stack for nested modals
let activeModalLocks = 0;
let savedBodyOverflow = '';
let savedBodyPaddingRight = '';
const escapeHandlers: Array<() => void> = [];

/**
 * Acquires a reference-counted background scroll lock and optional topmost Escape handler.
 * Returns a release callback that restores body scroll only when the final modal closes.
 */
export function acquireModalLock(onEscape?: () => void): () => void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return () => {};
  }

  if (activeModalLocks === 0) {
    savedBodyOverflow = document.body.style.overflow;
    savedBodyPaddingRight = document.body.style.paddingRight;
    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollBarWidth > 0) {
      document.body.style.paddingRight = `${scrollBarWidth}px`;
    }
  }
  activeModalLocks += 1;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && onEscape && escapeHandlers[escapeHandlers.length - 1] === onEscape) {
      e.stopPropagation();
      onEscape();
    }
  };

  if (onEscape) {
    escapeHandlers.push(onEscape);
    window.addEventListener('keydown', handleKeyDown);
  }

  return () => {
    if (onEscape) {
      window.removeEventListener('keydown', handleKeyDown);
      const idx = escapeHandlers.lastIndexOf(onEscape);
      if (idx !== -1) escapeHandlers.splice(idx, 1);
    }

    activeModalLocks = Math.max(0, activeModalLocks - 1);
    if (activeModalLocks === 0) {
      document.body.style.overflow = savedBodyOverflow;
      document.body.style.paddingRight = savedBodyPaddingRight;
    }
  };
}

/**
 * Locks background body scrolling with scrollbar-width compensation while one or more
 * modals are open, and routes Escape key presses exclusively to the topmost modal.
 */
export function useModalScrollLock(isOpen: boolean, onClose?: () => void) {
  const onCloseRef = React.useRef(onClose);
  const hasOnClose = Boolean(onClose);

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!isOpen) return;
    const escapeCallback = hasOnClose ? () => onCloseRef.current?.() : undefined;
    return acquireModalLock(escapeCallback);
  }, [isOpen, hasOnClose]);
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
  className?: string;
  bodyClassName?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'lg',
  className = '',
  bodyClassName = '',
}: ModalProps) {
  const titleId = React.useId();
  const descId = React.useId();

  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  useModalScrollLock(isOpen, onClose);

  if (!isOpen || !mounted) return null;

  const maxWidths: Record<NonNullable<ModalProps['maxWidth']>, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-3xl',
    '3xl': 'max-w-4xl',
    '4xl': 'max-w-5xl',
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150 overscroll-contain"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={`w-full max-w-[calc(100vw-1.5rem)] ${maxWidths[maxWidth]} max-h-[90vh] max-h-[90dvh] flex flex-col rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden transform transition-all ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
      >
        <div className="flex items-start sm:items-center justify-between border-b border-slate-100 px-4 sm:px-5 py-3 bg-slate-50/80 shrink-0">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-bold text-slate-800 leading-snug">
              {title}
            </h3>
            {description && (
              <p id={descId} className="text-xs text-slate-500 mt-0.5 leading-normal">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition-colors shrink-0 ml-3"
            aria-label="Close modal"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className={`flex-1 min-h-0 p-4 sm:p-5 overflow-y-auto overscroll-contain ${bodyClassName}`}>
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-slate-100 bg-slate-50/80 px-4 sm:px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
