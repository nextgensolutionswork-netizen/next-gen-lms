'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Keep route/account changes and out-of-order responses from exposing stale records. */
export function useRecordLoad<T>(key: string | null, load: (signal: AbortSignal) => Promise<T | null>) {
  const request = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ key: string | null; data: T | null; status: 'loading' | 'ready' | 'missing' | 'error'; error: string }>({ key: null, data: null, status: 'loading', error: '' });

  const reload = useCallback(() => {
    request.current?.abort();
    if (!key) return;
    const controller = new AbortController();
    request.current = controller;
    load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ key, data, status: data === null ? 'missing' : 'ready', error: '' });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ key, data: null, status: 'error', error: error instanceof Error ? error.message : 'Unable to load this record. Please retry.' });
      });
  }, [key, load]);

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    request.current = controller;
    let active = true;
    load(controller.signal)
      .then((data) => {
        if (active && !controller.signal.aborted) setState({ key, data, status: data === null ? 'missing' : 'ready', error: '' });
      })
      .catch((error) => {
        if (active && !controller.signal.aborted) setState({ key, data: null, status: 'error', error: error instanceof Error ? error.message : 'Unable to load this record. Please retry.' });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [key, load]);

  const current = state.key === key && key !== null ? state : { data: null, status: 'loading' as const, error: '' };
  return { ...current, reload };
}
