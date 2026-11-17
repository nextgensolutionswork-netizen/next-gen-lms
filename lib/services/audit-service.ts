import { store } from './data-store';
import { AuditLog } from '@/types';
import { createClient, isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createBrowserClient } from '@supabase/supabase-js';
import { resolveSupabaseKey } from '@/lib/supabase/client';

function getAuditSupabaseClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey && !serviceKey.includes('mock') && !serviceKey.includes('placeholder')) {
    return createAdminClient();
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock-sap-lms.supabase.co';
  const anonKey = resolveSupabaseKey(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  return createBrowserClient(url, anonKey);
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch('/api/audit-logs');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.logs)) {
          store.auditLogs = data.logs;
          return data.logs;
        }
      } else if (res.status === 403) {
        console.warn('Unauthorized audit trail access blocked by server RBAC.');
        return [];
      }
    } catch (err) {
      console.warn('Client audit-logs API fetch error, fallback to local store:', err);
    }
  }

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

  return [...(store.auditLogs || [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function recordAuditLog(
  data: Omit<AuditLog, 'id' | 'created_at'>
): Promise<AuditLog> {
  // 1. Client-Side Browser Path: Forward to authoritative POST /api/audit-logs
  if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
    try {
      const res = await fetch('/api/audit-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(data),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.log) {
          store.auditLogs.unshift(json.log);
          return json.log;
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        console.warn('[audit-service] Remote audit submission returned error:', res.status, errJson);
      }
    } catch (err) {
      console.warn('[audit-service] Client audit-logs remote fetch error, falling back to local store:', err);
    }
  }

  // 2. Server-Side Path: Atomic Local Storage & Database Mirror
  const log: AuditLog = {
    ...data,
    id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    created_at: new Date().toISOString(),
  };

  store.auditLogs.unshift(log);
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = getAuditSupabaseClient();
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(log.user_id || '');
      const user = (store.users || []).find((u) => u.id === log.user_id);
      const userEmail = user?.email || (log.user_id?.includes('@') ? log.user_id : `${log.user_id || 'system'}@lms.internal`);

      await supabase.from('audit_logs').insert({
        id: crypto.randomUUID(),
        user_id: isUUID ? log.user_id : null,
        user_email: userEmail,
        action: log.action,
        module: log.module,
        record_id: log.record_id,
        payload: {
          user_name: log.user_name,
          user_role: log.user_role,
          old_value: log.old_value,
          new_value: log.new_value,
        },
        created_at: log.created_at,
      });
    } catch (err) {
      console.warn('[audit-service] Supabase audit log insert warning, preserved locally:', err);
    }
  }

  return log;
}
