import { store } from './data-store';
import { StudentPaymentRecord, UserProfile } from '@/types';
import { tenantId } from '@/lib/auth/tenant';

export function paymentAudit(action: string, payment: StudentPaymentRecord, actor: UserProfile, before?: StudentPaymentRecord) {
  store.auditLogs.unshift({
    id: crypto.randomUUID(), tenant_id: tenantId(actor), user_id: actor.id,
    user_name: actor.full_name, user_role: actor.role, module: 'Payment Approvals',
    action, record_id: payment.id, old_value: before ? structuredClone(before) : undefined,
    new_value: structuredClone(payment), created_at: new Date().toISOString(),
  });
}

export function paymentNotification(user: UserProfile, title: string, message: string, actionUrl: string, eventId: string) {
  const id = `${eventId}:${user.id}`;
  if (store.notifications.some((n) => n.id === id)) return;
  store.notifications.unshift({
    id, tenant_id: tenantId(user), user_id: user.id, title, message,
    category: 'payment', type: 'info', is_read: false,
    action_url: actionUrl, created_at: new Date().toISOString(),
  });
}
