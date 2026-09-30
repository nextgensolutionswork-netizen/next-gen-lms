import { store } from './data-store';
import { AuditLog } from '@/types';
import { isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { dbRecordAuditLog } from '@/lib/supabase/db-service';

export async function getAuditLogs(): Promise<AuditLog[]> {
  return [...store.auditLogs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function recordAuditLog(
  data: Omit<AuditLog, 'id' | 'created_at'>
): Promise<AuditLog> {
  const log: AuditLog = {
    ...data,
    id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    created_at: new Date().toISOString(),
  };

  store.auditLogs.unshift(log);

  if (isLiveSupabaseEnabled()) {
    try {
      await dbRecordAuditLog(log);
    } catch (err) {
      console.warn('Supabase audit log insert error, saved locally:', err);
    }
  }

  return log;
}
