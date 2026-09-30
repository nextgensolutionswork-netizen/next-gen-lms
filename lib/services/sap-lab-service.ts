import { store } from './data-store';
import { SapServerAllocation, SapServerSystem } from '@/types';
import { recordAuditLog } from './audit-service';
import { createClient, isLiveSupabaseEnabled } from '@/lib/supabase/db';

export async function getSapSystems(): Promise<SapServerSystem[]> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.from('sap_server_systems').select('*');
      if (!error && data && data.length > 0) {
        store.sapSystems = data as SapServerSystem[];
        return data as SapServerSystem[];
      }
    } catch (err) {
      console.warn('Supabase sap_server_systems query error, fallback to local persistent store:', err);
    }
  }
  return [...store.sapSystems];
}

export async function getSapAllocations(): Promise<SapServerAllocation[]> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('sap_server_allocations')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        store.sapAllocations = data as SapServerAllocation[];
        return data as SapServerAllocation[];
      }
    } catch (err) {
      console.warn('Supabase sap_server_allocations query error, fallback to local persistent store:', err);
    }
  }

  return [...store.sapAllocations].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function getAllocationForStudent(studentId: string): Promise<SapServerAllocation | undefined> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('sap_server_allocations')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .maybeSingle();

      if (!error && data) {
        return data as SapServerAllocation;
      }
    } catch (err) {
      console.warn('Supabase getAllocationForStudent error, checking local store:', err);
    }
  }

  return store.sapAllocations.find(
    (a) => a.student_id === studentId && (a.status === 'Active' || a.status === 'Expired')
  );
}

export interface ProvisionSapAccessInput {
  student_id: string;
  system_id: string;
  client_number?: string;
  sap_user_id?: string;
  sap_password?: string;
  valid_months?: number;
}

export async function provisionSapAccess(
  input: ProvisionSapAccessInput,
  allocatedByUserId: string
): Promise<SapServerAllocation> {
  const student = store.students.find((s) => s.id === input.student_id);
  if (!student) throw new Error('Student not found');

  const system = store.sapSystems.find((sys) => sys.id === input.system_id);
  if (!system) throw new Error('SAP Server System not found');

  // Prevent multiple active allocations on same system
  const existingActive = store.sapAllocations.find(
    (a) => a.student_id === input.student_id && a.system_id === input.system_id && a.status === 'Active'
  );
  if (existingActive) {
    throw new Error(`Student already has an active SAP sandbox allocation (${existingActive.sap_user_id}) on ${system.system_name}`);
  }

  const course = store.courses.find((c) => c.id === student.course_id);
  const now = new Date();
  const validFrom = now.toISOString().slice(0, 10);
  const validToDate = new Date(now);
  validToDate.setMonth(validToDate.getMonth() + (input.valid_months || 3));
  const validTo = validToDate.toISOString().slice(0, 10);

  const cleanFirstName = student.full_name.split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '');
  const userSequence = store.sapAllocations.length + 10;
  const sap_user_id = input.sap_user_id || `SAP_${cleanFirstName}${userSequence}`;
  const sap_password = input.sap_password || `Welcome#${Math.floor(1000 + Math.random() * 9000)}`;

  const newAllocation: SapServerAllocation = {
    id: `alloc-${Date.now()}`,
    student_id: student.id,
    student_name: student.full_name,
    admission_number: student.admission_number,
    course_id: student.course_id,
    course_name: course?.course_name || 'SAP Professional Program',
    system_id: system.id,
    system_name: system.system_name,
    server_host: system.server_host,
    sid: system.sid,
    instance_number: system.instance_number,
    client_number: input.client_number || system.default_client,
    sap_user_id,
    sap_password,
    valid_from: validFrom,
    valid_to: validTo,
    status: 'Active',
    allocated_by: allocatedByUserId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  store.sapAllocations.unshift(newAllocation);
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('sap_server_allocations').insert({
        id: newAllocation.id,
        student_id: newAllocation.student_id,
        student_name: newAllocation.student_name,
        admission_number: newAllocation.admission_number,
        course_id: newAllocation.course_id,
        course_name: newAllocation.course_name,
        system_id: newAllocation.system_id,
        system_name: newAllocation.system_name,
        server_host: newAllocation.server_host,
        sid: newAllocation.sid,
        instance_number: newAllocation.instance_number,
        client_number: newAllocation.client_number,
        sap_user_id: newAllocation.sap_user_id,
        sap_password: newAllocation.sap_password,
        valid_from: newAllocation.valid_from,
        valid_to: newAllocation.valid_to,
        status: newAllocation.status,
        allocated_by: allocatedByUserId,
        created_at: newAllocation.created_at,
        updated_at: newAllocation.updated_at,
      });
    } catch (err) {
      console.warn('Supabase provisionSapAccess direct query warning, preserved locally:', err);
    }
  }

  const actor = store.users.find((u) => u.id === allocatedByUserId);
  await recordAuditLog({
    user_id: allocatedByUserId,
    user_name: actor?.full_name || 'Admin',
    user_role: actor?.role || 'admin',
    action: 'SAP_SANDBOX_PROVISIONED',
    module: 'ACADEMICS',
    record_id: newAllocation.id,
    new_value: {
      student: student.full_name,
      system: system.system_name,
      sap_user_id,
      valid_to: validTo,
    },
  });

  return newAllocation;
}

export async function extendSapAccess(
  allocationId: string,
  newValidTo: string,
  actionByUserId: string
): Promise<SapServerAllocation> {
  const alloc = store.sapAllocations.find((a) => a.id === allocationId);
  if (!alloc) throw new Error('Allocation not found');

  const oldTo = alloc.valid_to;
  alloc.valid_to = newValidTo;
  alloc.status = 'Active';
  alloc.updated_at = new Date().toISOString();
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase
        .from('sap_server_allocations')
        .update({
          valid_to: newValidTo,
          status: 'Active',
          updated_at: alloc.updated_at,
        })
        .eq('id', allocationId);
    } catch (err) {
      console.warn('Supabase extendSapAccess warning, preserved locally:', err);
    }
  }

  const actor = store.users.find((u) => u.id === actionByUserId);
  await recordAuditLog({
    user_id: actionByUserId,
    user_name: actor?.full_name || 'Admin',
    user_role: actor?.role || 'admin',
    action: 'SAP_SANDBOX_EXTENDED',
    module: 'ACADEMICS',
    record_id: alloc.id,
    old_value: { valid_to: oldTo },
    new_value: { valid_to: newValidTo, status: 'Active' },
  });

  return alloc;
}

export async function revokeSapAccess(
  allocationId: string,
  actionByUserId: string
): Promise<SapServerAllocation> {
  const alloc = store.sapAllocations.find((a) => a.id === allocationId);
  if (!alloc) throw new Error('Allocation not found');

  alloc.status = 'Revoked';
  alloc.updated_at = new Date().toISOString();
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase
        .from('sap_server_allocations')
        .update({
          status: 'Revoked',
          updated_at: alloc.updated_at,
        })
        .eq('id', allocationId);
    } catch (err) {
      console.warn('Supabase revokeSapAccess warning, preserved locally:', err);
    }
  }

  const actor = store.users.find((u) => u.id === actionByUserId);
  await recordAuditLog({
    user_id: actionByUserId,
    user_name: actor?.full_name || 'Admin',
    user_role: actor?.role || 'admin',
    action: 'SAP_SANDBOX_REVOKED',
    module: 'ACADEMICS',
    record_id: alloc.id,
    new_value: { status: 'Revoked' },
  });

  return alloc;
}

/**
 * Generates official SAP GUI Logon shortcut (.sap) file content.
 * Double clicking this file opens SAP GUI and pre-fills the server parameters.
 */
export function generateSapGuiShortcutContent(allocation: SapServerAllocation): string {
  return `[System]
Name=${allocation.sid}
Description=${allocation.system_name}
Client=${allocation.client_number}
[User]
Name=${allocation.sap_user_id}
Language=EN
[Function]
Title=SAP Easy Access
Command=SESSION_MANAGER
[Configuration]
GuiParm=/M/${allocation.server_host}/S/36${allocation.instance_number}/G/SPACE
`;
}
