import { store } from './data-store';
import { StudentDoubt, DoubtMessage, DoubtStatus, DoubtPriority, DoubtCategory, UserRole } from '@/types';
import { recordAuditLog } from './audit-service';
import { createClient, isLiveSupabaseEnabled } from '@/lib/supabase/db';
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
      const supabase = createClient();
      let query = supabase
        .from('student_doubts')
        .select('*, messages:doubt_messages(*)')
        .order('updated_at', { ascending: false });

      if (filters?.student_id) {
        query = query.eq('student_id', filters.student_id);
      }
      if (filters?.assigned_to_id) {
        query = query.eq('assigned_to_id', filters.assigned_to_id);
      }
      if (filters?.status && filters.status !== 'All') {
        query = query.eq('status', filters.status);
      }
      if (filters?.category && filters.category !== 'All') {
        query = query.eq('category', filters.category);
      }
      if (filters?.search && filters.search.trim()) {
        query = query.ilike('title', `%${filters.search.trim()}%`);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        store.doubts = data as StudentDoubt[];
        return data as StudentDoubt[];
      }
    } catch (err) {
      console.warn('Supabase doubts direct query error, falling back to local persistent store:', err);
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
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('student_doubts')
        .select('*, messages:doubt_messages(*)')
        .or(`id.eq.${id},ticket_number.eq.${id}`)
        .maybeSingle();

      if (!error && data) {
        return data as StudentDoubt;
      }
    } catch (err) {
      console.warn('Supabase getDoubtById error, checking local store:', err);
    }
  }

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
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('student_doubts').insert({
        id: newDoubt.id,
        ticket_number: newDoubt.ticket_number,
        student_id: newDoubt.student_id,
        student_name: newDoubt.student_name,
        admission_number: newDoubt.admission_number,
        course_id: newDoubt.course_id,
        course_name: newDoubt.course_name,
        batch_id: newDoubt.batch_id,
        batch_name: newDoubt.batch_name,
        assigned_to_id: newDoubt.assigned_to_id,
        assigned_to_name: newDoubt.assigned_to_name,
        assigned_to_role: newDoubt.assigned_to_role,
        title: newDoubt.title,
        description: newDoubt.description,
        category: newDoubt.category,
        priority: newDoubt.priority,
        status: newDoubt.status,
        sap_tcode: newDoubt.sap_tcode,
        created_at: newDoubt.created_at,
        updated_at: newDoubt.updated_at,
      });

      await supabase.from('doubt_messages').insert({
        id: initialMessage.id,
        doubt_id: newDoubt.id,
        sender_id: initialMessage.sender_id,
        sender_name: initialMessage.sender_name,
        sender_role: initialMessage.sender_role,
        message: initialMessage.message,
        attachment_url: initialMessage.attachment_url,
        created_at: initialMessage.created_at,
      });
    } catch (err) {
      console.warn('Supabase direct student_doubts insert warning, preserved locally:', err);
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

  // 1. Broadcast real-time event to staff support desk and Supabase doubt_messages channel
  publishRealtimeEvent('doubts', 'doubt_created', newDoubt);
  try {
    const supabase = createClient();
    if (supabase && typeof supabase.channel === 'function') {
      supabase.channel('doubt_messages').send({
        type: 'broadcast',
        event: 'doubt_created',
        payload: newDoubt,
      });
    }
  } catch (err) {
    // ignore
  }

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

  // If support or trainer replies, transition from Open/Assigned to In Progress
  if ((senderRole === 'support' || senderRole === 'trainer' || senderRole === 'admin') && doubt.status !== 'Resolved') {
    doubt.status = 'In Progress';
  }
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('doubt_messages').insert({
        id: newMessage.id,
        doubt_id: doubt.id,
        sender_id: newMessage.sender_id,
        sender_name: newMessage.sender_name,
        sender_role: newMessage.sender_role,
        message: newMessage.message,
        attachment_url: newMessage.attachment_url,
        created_at: newMessage.created_at,
      });

      await supabase
        .from('student_doubts')
        .update({
          status: doubt.status,
          updated_at: now,
        })
        .eq('id', doubt.id);
    } catch (err) {
      console.warn('Supabase direct doubt reply warning, preserved locally:', err);
    }
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
  try {
    const supabase = createClient();
    if (supabase && typeof supabase.channel === 'function') {
      supabase.channel('doubt_messages').send({
        type: 'broadcast',
        event: 'doubt_reply',
        payload: {
          doubtId: doubt.id,
          message: newMessage,
          status: doubt.status,
        },
      });
    }
  } catch (err) {
    // ignore
  }

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
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase
        .from('student_doubts')
        .update({
          assigned_to_id: mentor.id,
          assigned_to_name: mentor.full_name,
          assigned_to_role: doubt.assigned_to_role,
          status: doubt.status,
          updated_at: doubt.updated_at,
        })
        .eq('id', doubt.id);
    } catch (err) {
      console.warn('Supabase assignDoubt direct query warning, preserved locally:', err);
    }
  }

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

  const actor = store.users.find((u) => u.id === resolvedByUserId);

  let resolutionMsg: DoubtMessage | undefined;
  if (resolutionNotes && resolutionNotes.trim()) {
    resolutionMsg = {
      id: `msg-${Date.now()}`,
      doubt_id: doubt.id,
      sender_id: resolvedByUserId,
      sender_name: actor?.full_name || 'Support Desk',
      sender_role: (actor?.role as UserRole) || 'support',
      message: `[Resolution Note]: ${resolutionNotes.trim()}`,
      created_at: now,
    };
    doubt.messages.push(resolutionMsg);
  }
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase
        .from('student_doubts')
        .update({
          status: 'Resolved',
          resolved_at: now,
          updated_at: now,
        })
        .eq('id', doubt.id);

      if (resolutionMsg) {
        await supabase.from('doubt_messages').insert({
          id: resolutionMsg.id,
          doubt_id: doubt.id,
          sender_id: resolutionMsg.sender_id,
          sender_name: resolutionMsg.sender_name,
          sender_role: resolutionMsg.sender_role,
          message: resolutionMsg.message,
          created_at: resolutionMsg.created_at,
        });
      }
    } catch (err) {
      console.warn('Supabase resolveDoubt direct query warning, preserved locally:', err);
    }
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
