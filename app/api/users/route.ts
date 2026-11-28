import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/services/data-store';
import { authenticateApiRequest } from '@/lib/auth/server-session';
import { isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/services/audit-service';
import { UserProfile, UserRole } from '@/types';
import { validatePhoneNumber } from '@/lib/utils/phone-validation';
import { validateEmailAddress } from '@/lib/utils/email-validation';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateApiRequest(req, {
      allowedRoles: ['super_admin', 'admin'],
      requiredPermission: 'users:read',
    });
    if (auth.errorResponse) return auth.errorResponse;

    if (isLiveSupabaseEnabled()) {
      try {
        const adminClient = createAdminClient();
        const { data: profiles, error } = await adminClient
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && profiles && profiles.length > 0) {
          store.users = profiles as UserProfile[];
        }
      } catch (err: any) {
        console.warn('[Users API] Supabase query warning, serving local store:', err?.message);
      }
    }

    return NextResponse.json({
      success: true,
      users: store.users || [],
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateApiRequest(req, {
      allowedRoles: ['super_admin', 'admin'],
      requiredPermission: 'users:write',
    });
    if (auth.errorResponse) return auth.errorResponse;

    const body = await req.json();
    const { email, full_name, role, phone, assigned_course_ids, password } = body;

    // Privilege Escalation Defense: Only Super Administrators can create Super Admin accounts
    if (role === 'super_admin' && auth.user.role !== 'super_admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Only Super Administrators can create Super Admin accounts.' },
        { status: 403 }
      );
    }

    if (!email || !full_name) {
      return NextResponse.json(
        { success: false, error: 'Email and Full Name are required.' },
        { status: 400 }
      );
    }

    const emailCheck = validateEmailAddress(email, 'Email address', true);
    if (!emailCheck.isValid) {
      return NextResponse.json(
        { success: false, error: emailCheck.error || 'Invalid email address.' },
        { status: 400 }
      );
    }
    const normalizedEmail = emailCheck.normalized!;

    // Check duplicate email (authoritative Supabase profiles when live, otherwise local store)
    if (isLiveSupabaseEnabled()) {
      const { data: existingProfile } = await createAdminClient()
        .from('profiles')
        .select('id')
        .eq('email', normalizedEmail)
        .maybeSingle();
      if (existingProfile) {
        return NextResponse.json(
          { success: false, error: 'A user account with this email address already exists.' },
          { status: 409 }
        );
      }
    } else if (store.users?.some((u) => u.email.toLowerCase() === normalizedEmail)) {
      return NextResponse.json(
        { success: false, error: 'A user account with this email address already exists.' },
        { status: 409 }
      );
    }

    let normalizedPhone: string | undefined = undefined;
    if (phone && typeof phone === 'string' && phone.trim()) {
      const pCheck = validatePhoneNumber('IN', phone, 'Phone number', false);
      if (!pCheck.isValid) {
        return NextResponse.json({ success: false, error: pCheck.error || 'Invalid phone number' }, { status: 400 });
      }
      normalizedPhone = pCheck.normalized || phone;
    }

    let authUserId = `usr-${Date.now()}`;

    // 1. Supabase Auth Admin creation if live database is enabled
    if (isLiveSupabaseEnabled()) {
      try {
        const adminClient = createAdminClient();
        const { data: created, error: authError } = await adminClient.auth.admin.inviteUserByEmail(
          email.trim().toLowerCase(),
          {
            data: {
              full_name: full_name.trim(),
              role: role || 'trainer',
              phone: normalizedPhone || '',
              assigned_course_ids: assigned_course_ids || [],
            },
          }
        );

        if (authError) {
          console.warn('[Users API] Supabase createUser error:', authError.message);
          return NextResponse.json(
            { success: false, error: `Supabase Auth error: ${authError.message}` },
            { status: 400 }
          );
        }

        if (created?.user) {
          authUserId = created.user.id;
          const { error: profileUpsertError } = await adminClient.from('profiles').upsert({
            id: authUserId,
            email: email.trim().toLowerCase(),
            full_name: full_name.trim(),
            role: role || 'trainer',
            phone: normalizedPhone || null,
            tenant_id: auth.user.tenant_id || 'default',
            assigned_course_ids: assigned_course_ids || [],
            is_active: true,
            updated_at: new Date().toISOString(),
          });
          if (profileUpsertError) {
            return NextResponse.json(
              { success: false, error: `Failed to provision user profile: ${profileUpsertError.message}` },
              { status: 500 }
            );
          }
        }
      } catch (err: any) {
        console.error('[Users API] Supabase provision exception:', err);
        return NextResponse.json(
          { success: false, error: `Failed to provision user identity: ${err?.message}` },
          { status: 500 }
        );
      }
    }

    // 2. Commit to store
    const newUser: UserProfile = {
      id: authUserId,
      email: email.trim().toLowerCase(),
      full_name: full_name.trim(),
      role: (role as UserRole) || 'trainer',
      phone: normalizedPhone || undefined,
      is_active: true,
      assigned_course_ids: assigned_course_ids || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (!store.users) store.users = [];
    store.users.push(newUser);
    store.persistSync();

    await recordAuditLog({
      user_id: auth.user.id,
      user_name: auth.user.full_name || 'Administrator',
      user_role: auth.user.role,
      action: 'USER_CREATED',
      module: 'USERS',
      record_id: newUser.id,
      new_value: newUser,
    });

    return NextResponse.json({
      success: true,
      user: newUser,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to create user' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await authenticateApiRequest(req, {
      allowedRoles: ['super_admin', 'admin'],
      requiredPermission: 'users:write',
    });
    if (auth.errorResponse) return auth.errorResponse;

    const body = await req.json();
    const { id, full_name, email, phone, role, is_active, assigned_course_ids } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'User ID is required.' },
        { status: 400 }
      );
    }

    const idx = (store.users || []).findIndex((u) => u.id === id);
    if (idx === -1) {
      return NextResponse.json(
        { success: false, error: 'User record not found.' },
        { status: 404 }
      );
    }

    const targetUser = store.users[idx];

    // Defense 1: Non-Super-Admin cannot modify, edit, or deactivate a Super Admin account
    if (auth.user.role !== 'super_admin' && targetUser.role === 'super_admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Administrators are not authorized to modify Super Administrator accounts.' },
        { status: 403 }
      );
    }

    // Defense 2: Non-Super-Admin cannot assign the super_admin role (privilege escalation)
    if (auth.user.role !== 'super_admin' && role === 'super_admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Only Super Administrators can grant or elevate users to the Super Admin role.' },
        { status: 403 }
      );
    }

    // Defense 3: Admin self-demotion & self-role-change defense
    // Admin cannot change their own role to any other role (demotion or promotion)
    if (id === auth.user.id && role !== undefined && role !== targetUser.role) {
      return NextResponse.json(
        { success: false, error: 'Self-Demotion Blocked: You cannot modify administrator rights on your own active account.' },
        { status: 403 }
      );
    }

    // Defense 4: Self-deactivation defense
    if (id === auth.user.id && is_active === false) {
      return NextResponse.json(
        { success: false, error: 'Action Prohibited: You cannot deactivate your own active session account.' },
        { status: 403 }
      );
    }

    let normalizedPhone = phone;
    if (phone !== undefined && phone !== null && typeof phone === 'string' && phone.trim()) {
      const pCheck = validatePhoneNumber('IN', phone, 'Phone number', false);
      if (!pCheck.isValid) {
        return NextResponse.json({ success: false, error: pCheck.error || 'Invalid phone number' }, { status: 400 });
      }
      normalizedPhone = pCheck.normalized || phone;
    }

    let normalizedEmail = store.users[idx].email;
    if (email !== undefined) {
      const emailCheck = validateEmailAddress(email, 'Email address', true);
      if (!emailCheck.isValid) {
        return NextResponse.json({ success: false, error: emailCheck.error || 'Invalid email address.' }, { status: 400 });
      }
      normalizedEmail = emailCheck.normalized!;
      if (store.users?.some((u) => u.id !== id && u.email.toLowerCase() === normalizedEmail)) {
        return NextResponse.json({ success: false, error: 'Another user account already uses this email address.' }, { status: 409 });
      }
    }

    const oldUser = { ...store.users[idx] };
    const updatedUser: UserProfile = {
      ...store.users[idx],
      full_name: full_name !== undefined ? full_name : store.users[idx].full_name,
      email: normalizedEmail,
      phone: phone !== undefined ? normalizedPhone : store.users[idx].phone,
      role: role !== undefined ? (role as UserRole) : store.users[idx].role,
      is_active: is_active !== undefined ? is_active : store.users[idx].is_active,
      assigned_course_ids: assigned_course_ids !== undefined ? assigned_course_ids : store.users[idx].assigned_course_ids,
      updated_at: new Date().toISOString(),
    };

    // 1. Supabase Auth update if live
    if (isLiveSupabaseEnabled()) {
      try {
        const adminClient = createAdminClient();
        const authUpdates: any = {};
        if (email) authUpdates.email = email.trim().toLowerCase();
        authUpdates.user_metadata = {
          full_name: updatedUser.full_name,
          role: updatedUser.role,
          phone: updatedUser.phone,
          assigned_course_ids: updatedUser.assigned_course_ids,
        };
        await adminClient.auth.admin.updateUserById(id, authUpdates);

        await adminClient.from('profiles').update({
          email: updatedUser.email,
          full_name: updatedUser.full_name,
          role: updatedUser.role,
          phone: updatedUser.phone,
          is_active: updatedUser.is_active,
          updated_at: updatedUser.updated_at,
        }).eq('id', id);
      } catch (err: any) {
        console.warn('[Users API] Supabase updateUser warning:', err?.message);
      }
    }

    store.users[idx] = updatedUser;
    store.persistSync();

    const action = is_active !== undefined && is_active !== oldUser.is_active
      ? (is_active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED')
      : 'USER_UPDATED';

    await recordAuditLog({
      user_id: auth.user.id,
      user_name: auth.user.full_name || 'Administrator',
      user_role: auth.user.role,
      action,
      module: 'USERS',
      record_id: id,
      old_value: oldUser,
      new_value: updatedUser,
    });

    return NextResponse.json({
      success: true,
      user: updatedUser,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to update user' },
      { status: 500 }
    );
  }
}
