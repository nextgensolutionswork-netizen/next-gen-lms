import { store } from './data-store';
import { AuditLog } from '@/types';
import { createClient, isLiveSupabaseEnabled } from '@/lib/supabase/db';

export async function getAuditLogs(): Promise<AuditLog[]> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        store.auditLogs = data as AuditLog[];
        return data as AuditLog[];
      }
    } catch (err) {
      console.warn('Supabase audit logs direct query error, falling back to local persistent store:', err);
    }
  }

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
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('audit_logs').insert({
        id: log.id,
        user_id: log.user_id,
        user_name: log.user_name,
        user_role: log.user_role,
        action: log.action,
        module: log.module,
        record_id: log.record_id,
        old_value: log.old_value,
        new_value: log.new_value,
        created_at: log.created_at,
      });
    } catch (err) {
      console.warn('Supabase audit log insert warning, preserved locally:', err);
    }
  }

  return log;
}
