'use client';

import * as React from 'react';
import { syncManager } from '@/lib/services/sync-manager';
import { SyncTopic } from '@/lib/services/sync-events';

export interface UseDataSyncOptions {
  domain: SyncTopic | string;
  onSync: () => void | Promise<void>;
  enabled?: boolean;
  pollIntervalMs?: number; // Bounded polling fallback if desired
}

export function useDataSync({
  domain,
  onSync,
  enabled = true,
  pollIntervalMs,
}: UseDataSyncOptions) {
  const [isOnline, setIsOnline] = React.useState(true);
  const [isReconnecting, setIsReconnecting] = React.useState(false);
  const onSyncRef = React.useRef(onSync);

  React.useEffect(() => {
    onSyncRef.current = onSync;
  }, [onSync]);

  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    // Register with sync manager for realtime signals, focus, and recovery revalidations
    const unsubscribe = syncManager.register(domain, () => {
      if (onSyncRef.current) {
        return onSyncRef.current();
      }
    });

    // Optional bounded polling fallback (e.g. 30s-60s) while tab is visible
    let pollTimer: NodeJS.Timeout | null = null;
    if (pollIntervalMs && pollIntervalMs >= 10000) {
      pollTimer = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          if (onSyncRef.current) {
            void onSyncRef.current();
          }
        }
      }, pollIntervalMs);
    }

    return () => {
      unsubscribe();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [domain, enabled, pollIntervalMs]);

  const revalidate = React.useCallback(() => {
    syncManager.triggerInvalidation(domain, 0);
  }, [domain]);

  return {
    isOnline,
    isReconnecting,
    revalidate,
  };
}
