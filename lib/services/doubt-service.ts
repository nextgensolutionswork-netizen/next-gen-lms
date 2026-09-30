import { store } from './data-store';
import { StudentDoubt, DoubtMessage, DoubtStatus, DoubtPriority, DoubtCategory, UserRole } from '@/types';
import { recordAuditLog } from './audit-service';
import { isLiveSupabaseEnabled } from '@/lib/supabase/db';
import {
  dbGetDoubts,
  dbCreateDoubt,
  dbReplyToDoubt,
  dbResolveDoubt,
} from '@/lib/supabase/db-service';
import { publishRealtimeEvent } from './realtime-service';
import {
  dispatchMultiChannelNotification,
  buildDoubtReplyEmailHtml,
} from './notification-service';

export async function getDoubts(filters?: {
  student_id?: string;
  assigned_to_id?: string;
  status?: DoubtStatus | 'All';
  category?: DoubtCategory | 'All';
  search?: string;
}): Promise<StudentDoubt[]> {
  if (isLiveSupabaseEnabled()) {
    try {
      const dbList = await dbGetDoubts(filters);
      if (dbList && dbList.length > 0) return dbList;
    } catch (err) {
      console.warn('Supabase doubts query error, falling back to local store:', err);
    }
  }

  let list = [...store.doubts];

  if (filters?.student_id) {
    list = list.filter((d) => d.student_id === filters.student_id);
  }

  if (filters?.assigned_to_id) {
    list = list.filter((d) => d.assigned_to_id === filters.assigned_to_id);
  }

  if (filters?.status && filters.status !== 'All') {
    list = list.filter((d) => d.status === filters.status);
  }

  if (filters?.category && filters.category !== 'All') {
    list = list.filter((d) => d.category === filters.category);
  }

  if (filters?.search && filters.search.trim()) {
    const q = filters.search.toLowerCase();
    list = list.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.ticket_number.toLowerCase().includes(q) ||
        d.student_name.toLowerCase().includes(q) ||
        (d.sap_tcode && d.sap_tcode.toLowerCase().includes(q))
    );
  }

  return list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

export async function getDoubtById(id: string): Promise<StudentDoubt | undefined> {
  return store.doubts.find((d) => d.id === id || d.ticket_number === id);
}

export interface CreateDoubtInput {
  student_id: string;
  title: string;
  description: string;
  category: DoubtCategory;
  priority?: DoubtPriority;
  sap_tcode?: string;
  assigned_to_id?: string;
  attachment_url?: string;
}

export async function createStudentDoubt(
  input: CreateDoubtInput,
  studentUserId: string
): Promise<StudentDoubt> {
  const student = store.students.find((s) => s.id === input.student_id);
  if (!student) throw new Error('Student not found');

  const course = store.courses.find((c) => c.id === student.course_id);
  const count = store.doubts.length + 1;
  const ticket_number = `DBT-2026-${String(count).padStart(3, '0')}`;
  const now = new Date().toISOString();

  // Find support mentor to auto-assign
  const supportUser = store.users.find(
    (u) => u.id === (input.assigned_to_id || 'usr-support-01')
  ) || store.users.find((u) => u.role === 'support');

  const doubtId = `dbt-${Date.now()}`;
  const initialMessage: DoubtMessage = {
    id: `msg-${Date.now()}`,
    doubt_id: doubtId,
    sender_id: studentUserId,
    sender_name: student.full_name,
    sender_role: 'student',
    message: input.description,
    attachment_url: input.attachment_url,
    created_at: now,
  };

  const newDoubt: StudentDoubt = {
    id: doubtId,
    ticket_number,
    student_id: student.id,
    student_name: student.full_name,
    admission_number: student.admission_number,
    course_id: student.course_id,
    course_name: course?.course_name || 'SAP Professional Program',
    batch_id: student.batch_id,
    batch_name: student.batch_name,
    assigned_to_id: supportUser?.id,
    assigned_to_name: supportUser?.full_name,
    assigned_to_role: 'support',
    title: input.title,
    description: input.description,
    category: input.category,
    priority: input.priority || 'Medium',
    status: supportUser ? 'Assigned' : 'Open',
    sap_tcode: input.sap_tcode ? input.sap_tcode.toUpperCase() : undefined,
    messages: [initialMessage],
    created_at: now,
    updated_at: now,
  };

  store.doubts.unshift(newDoubt);

  if (isLiveSupabaseEnabled()) {
    try {
      await dbCreateDoubt(newDoubt, input.description, studentUserId, student.full_name);
    } catch (err) {
      console.warn('Supabase doubt insert error, saved locally:', err);
    }
  }

  await recordAuditLog({
    user_id: studentUserId,
    user_name: student.full_name,
    user_role: 'student',
    action: 'STUDENT_DOUBT_CREATED',
    module: 'SUPPORT',
    record_id: newDoubt.id,
    new_value: {
      ticket_number,
      title: input.title,
      category: input.category,
      assigned_to: supportUser?.full_name,
    },
  });

  // 1. Broadcast real-time event to staff support desk
  publishRealtimeEvent('doubts', 'doubt_created', newDoubt);

  // 2. Dispatch notification to assigned support mentor
  if (supportUser) {
    dispatchMultiChannelNotification({
      userId: supportUser.id,
      recipientName: supportUser.full_name,
      recipientEmail: supportUser.email,
      title: `New Doubt Ticket #${ticket_number}`,
      message: `${student.full_name} submitted a query: "${input.title}" (${input.category})`,
      category: 'support',
      type: 'info',
      channels: ['in_app'],
      actionUrl: '/support',
    }).catch((err) => console.warn('Failed to dispatch mentor notification:', err));
  }

  return newDoubt;
}

export async function replyToDoubt(
  doubtId: string,
  message: string,
  senderUserId: string,
  senderRole: UserRole,
  senderName: string,
  attachmentUrl?: string
): Promise<DoubtMessage> {
  const doubt = store.doubts.find((d) => d.id === doubtId);
  if (!doubt) throw new Error('Doubt ticket not found');

  if (!message || message.trim() === '') {
    throw new Error('Reply message cannot be empty');
  }

  const now = new Date().toISOString();
  const newMessage: DoubtMessage = {
    id: `msg-${Date.now()}`,
    doubt_id: doubt.id,
    sender_id: senderUserId,
    sender_name: senderName,
    sender_role: senderRole,
    message: message.trim(),
    attachment_url: attachmentUrl,
    created_at: now,
  };

  doubt.messages.push(newMessage);
  doubt.updated_at = now;

  if (isLiveSupabaseEnabled()) {
    try {
      await dbReplyToDoubt(doubt.id, newMessage);
    } catch (err) {
      console.warn('Supabase reply insert error, saved locally:', err);
    }
  }

  // If support or trainer replies, transition from Open/Assigned to In Progress
  if ((senderRole === 'support' || senderRole === 'trainer' || senderRole === 'admin') && doubt.status !== 'Resolved') {
    doubt.status = 'In Progress';
  }

  await recordAuditLog({
    user_id: senderUserId,
    user_name: senderName,
    user_role: senderRole,
    action: 'DOUBT_REPLY_POSTED',
    module: 'SUPPORT',
    record_id: doubt.id,
    new_value: { ticket_number: doubt.ticket_number, reply_by: senderName },
  });

  // 1. Broadcast real-time message to general doubts topic and specific doubt thread
  publishRealtimeEvent('doubts', 'doubt_reply', {
    doubtId: doubt.id,
    message: newMessage,
    status: doubt.status,
  });
  publishRealtimeEvent(`doubt:${doubt.id}`, 'doubt_reply', {
    doubtId: doubt.id,
    message: newMessage,
    status: doubt.status,
  });

  // 2. Dispatch multi-channel notifications
  if (senderRole !== 'student') {
    // Mentor replied -> Notify student via in-app, Resend email, and WhatsApp
    const student = store.students.find((s) => s.id === doubt.student_id);
    const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://lms.next-generpsolutions.com'}/portal`;
    const emailHtml = buildDoubtReplyEmailHtml({
      studentName: doubt.student_name,
      ticketNumber: doubt.ticket_number,
      doubtTitle: doubt.title,
      mentorName: senderName,
      replyMessage: message.trim(),
      portalUrl,
    });

    dispatchMultiChannelNotification({
      userId: student?.user_id || doubt.student_id,
      recipientName: doubt.student_name,
      recipientEmail: student?.email,
      recipientPhone: student?.phone,
      title: `Mentor Reply on Doubt #${doubt.ticket_number}`,
      message: `${senderName}: "${message.trim().slice(0, 120)}${message.trim().length > 120 ? '...' : ''}"`,
      category: 'support',
      type: 'info',
      channels: ['in_app', 'email', 'whatsapp'],
      actionUrl: '/portal',
      metadata: { htmlTemplate: emailHtml },
    }).catch((err) => console.warn('Failed to dispatch student notification:', err));
  } else {
    // Student replied -> Notify assigned support mentor
    if (doubt.assigned_to_id) {
      const mentor = store.users.find((u) => u.id === doubt.assigned_to_id);
      dispatchMultiChannelNotification({
        userId: doubt.assigned_to_id,
        recipientName: mentor?.full_name || 'Support Mentor',
        recipientEmail: mentor?.email,
        title: `Student Reply on Ticket #${doubt.ticket_number}`,
        message: `${senderName}: "${message.trim().slice(0, 120)}"`,
        category: 'support',
        type: 'info',
        channels: ['in_app'],
        actionUrl: '/support',
      }).catch((err) => console.warn('Failed to dispatch mentor notification:', err));
    }
  }

  return newMessage;
}

export async function assignDoubt(
  doubtId: string,
  assignedToUserId: string,
  assignedByUserId: string
): Promise<StudentDoubt> {
  const doubt = store.doubts.find((d) => d.id === doubtId);
  if (!doubt) throw new Error('Doubt ticket not found');

  const mentor = store.users.find((u) => u.id === assignedToUserId);
  if (!mentor) throw new Error('Support user or mentor not found');

  doubt.assigned_to_id = mentor.id;
  doubt.assigned_to_name = mentor.full_name;
  doubt.assigned_to_role = mentor.role === 'trainer' ? 'trainer' : 'support';
  if (doubt.status === 'Open') {
    doubt.status = 'Assigned';
  }
  doubt.updated_at = new Date().toISOString();

  const actor = store.users.find((u) => u.id === assignedByUserId);
  await recordAuditLog({
    user_id: assignedByUserId,
    user_name: actor?.full_name || 'Admin',
    user_role: actor?.role || 'admin',
    action: 'DOUBT_ASSIGNED',
    module: 'SUPPORT',
    record_id: doubt.id,
    new_value: { ticket_number: doubt.ticket_number, mentor: mentor.full_name },
  });

  // Broadcast real-time assignment update
  publishRealtimeEvent('doubts', 'doubt_assigned', {
    doubtId: doubt.id,
    assignedToId: mentor.id,
    assignedToName: mentor.full_name,
    status: doubt.status,
  });

  return doubt;
}

export async function resolveDoubt(
  doubtId: string,
  resolvedByUserId: string,
  resolutionNotes?: string
): Promise<StudentDoubt> {
  const doubt = store.doubts.find((d) => d.id === doubtId);
  if (!doubt) throw new Error('Doubt ticket not found');

  const now = new Date().toISOString();
  doubt.status = 'Resolved';
  doubt.resolved_at = now;
  doubt.updated_at = now;

  if (isLiveSupabaseEnabled()) {
    try {
      await dbResolveDoubt(doubt.id, resolvedByUserId, resolutionNotes);
    } catch (err) {
      console.warn('Supabase resolve error, saved locally:', err);
    }
  }

  const actor = store.users.find((u) => u.id === resolvedByUserId);

  if (resolutionNotes && resolutionNotes.trim()) {
    doubt.messages.push({
      id: `msg-${Date.now()}`,
      doubt_id: doubt.id,
      sender_id: resolvedByUserId,
      sender_name: actor?.full_name || 'Support Desk',
      sender_role: (actor?.role as UserRole) || 'support',
      message: `[Resolution Note]: ${resolutionNotes.trim()}`,
      created_at: now,
    });
  }

  await recordAuditLog({
    user_id: resolvedByUserId,
    user_name: actor?.full_name || 'Support Staff',
    user_role: actor?.role || 'support',
    action: 'DOUBT_RESOLVED',
    module: 'SUPPORT',
    record_id: doubt.id,
    new_value: { ticket_number: doubt.ticket_number, resolved_by: actor?.full_name },
  });

  // 1. Broadcast real-time resolution event
  publishRealtimeEvent('doubts', 'doubt_resolved', {
    doubtId: doubt.id,
    status: 'Resolved',
    resolvedBy: actor?.full_name,
  });
  publishRealtimeEvent(`doubt:${doubt.id}`, 'doubt_resolved', {
    doubtId: doubt.id,
    status: 'Resolved',
    resolvedBy: actor?.full_name,
  });

  // 2. Dispatch notification to student
  const student = store.students.find((s) => s.id === doubt.student_id);
  dispatchMultiChannelNotification({
    userId: student?.user_id || doubt.student_id,
    recipientName: doubt.student_name,
    recipientEmail: student?.email,
    recipientPhone: student?.phone,
    title: `Doubt Ticket Resolved: #${doubt.ticket_number}`,
    message: `Your query "${doubt.title}" has been marked as resolved by ${actor?.full_name || 'Academic Mentor'}.`,
    category: 'support',
    type: 'success',
    channels: ['in_app', 'whatsapp'],
    actionUrl: '/portal',
  }).catch((err) => console.warn('Failed to dispatch resolution notification:', err));

  return doubt;
}
