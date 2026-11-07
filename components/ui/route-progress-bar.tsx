'use client';

import * as React from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

function ProgressBarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [isLoading, setIsLoading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [visible, setVisible] = React.useState(false);

  const pendingUrlRef = React.useRef<string | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Complete progress bar when route changes
  React.useEffect(() => {
    if (isLoading) {
      setProgress(100);
      const hideTimeout = setTimeout(() => {
        setIsLoading(false);
        setVisible(false);
        setProgress(0);
        pendingUrlRef.current = null;
      }, 250);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      return () => clearTimeout(hideTimeout);
    }
  }, [pathname, searchParams]);

  // Click listener for internal links
  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Ignore modified clicks (cmd, ctrl, shift, alt) or non-left clicks
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) {
        return;
      }

      const target = (e.target as HTMLElement).closest('a');
      if (!target || !target.href) return;

      // Ignore external links or target="_blank"
      if (target.target && target.target !== '_self') return;
      if (target.hasAttribute('download')) return;

      const url = new URL(target.href, window.location.href);
      const currentUrl = new URL(window.location.href);

      // Must be same origin
      if (url.origin !== currentUrl.origin) return;

      // Ignore hash-only changes on current page
      if (url.pathname === currentUrl.pathname && url.search === currentUrl.search) {
        return;
      }

      const targetPath = url.pathname + url.search;

      // Prevent duplicate clicks if user repeatedly clicks the same link while navigation is in flight
      if (pendingUrlRef.current === targetPath) {
        e.preventDefault();
        return;
      }

      pendingUrlRef.current = targetPath;

      // Start progress
      if (timerRef.current) clearInterval(timerRef.current);
      setVisible(true);
      setIsLoading(true);
      setProgress(20);

      // Smoothly advance progress up to 85% until route finishes
      timerRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 85) return prev;
          const remaining = 85 - prev;
          return prev + Math.max(2, Math.floor(remaining * 0.1));
        });
      }, 150);
    };

    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 h-[2.5px] z-[99999] pointer-events-none transition-all duration-200 ease-out"
      style={{
        width: `${progress}%`,
        backgroundColor: '#0A6ED1',
        boxShadow: '0 0 10px #0A6ED1, 0 0 5px #0A6ED1',
        opacity: progress === 100 ? 0 : 1,
      }}
    />
  );
}

export function RouteProgressBar() {
  return (
    <React.Suspense fallback={null}>
      <ProgressBarInner />
    </React.Suspense>
  );
}

