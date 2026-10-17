import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/services/data-store';
import { authenticateApiRequest } from '@/lib/auth/server-session';
import { isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/services/audit-service';
import { UserProfile, UserRole } from '@/types';

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

    if (!email || !full_name) {
      return NextResponse.json(
        { success: false, error: 'Email and Full Name are required.' },
        { status: 400 }
      );
    }

    let authUserId = `usr-${Date.now()}`;

    // 1. Supabase Auth Admin creation if live database is enabled
    if (isLiveSupabaseEnabled()) {
      try {
        const adminClient = createAdminClient();
        const { data: created, error: authError } = await adminClient.auth.admin.createUser({
          email: email.trim().toLowerCase(),
          password: password || 'TempPass@2026!',
          email_confirm: true,
          user_metadata: {
            full_name: full_name.trim(),
            role: role || 'trainer',
            phone: phone || '',
            assigned_course_ids: assigned_course_ids || [],
          },
        });

        if (authError) {
          console.warn('[Users API] Supabase createUser error:', authError.message);
          return NextResponse.json(
            { success: false, error: `Supabase Auth error: ${authError.message}` },
            { status: 400 }
          );
        }

        if (created?.user) {
          authUserId = created.user.id;
          await adminClient.from('profiles').upsert({
            id: authUserId,
            email: email.trim().toLowerCase(),
            full_name: full_name.trim(),
            role: role || 'trainer',
            phone: phone || null,
            is_active: true,
            updated_at: new Date().toISOString(),
          });
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
      phone: phone || undefined,
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

    // Self-demotion defense: cannot strip admin privileges from own session
    if (
      id === auth.user.id &&
      role !== undefined &&
      role !== store.users[idx].role &&
      !['super_admin', 'admin'].includes(role)
    ) {
      return NextResponse.json(
        { success: false, error: 'Self-Demotion Blocked: You cannot revoke administrator rights from your own active account.' },
        { status: 403 }
      );
    }

    // Self-deactivation defense
    if (id === auth.user.id && is_active === false) {
      return NextResponse.json(
        { success: false, error: 'Action Prohibited: You cannot deactivate your own active session account.' },
        { status: 403 }
      );
    }

    const oldUser = { ...store.users[idx] };
    const updatedUser: UserProfile = {
      ...store.users[idx],
      full_name: full_name !== undefined ? full_name : store.users[idx].full_name,
      email: email !== undefined ? email.trim().toLowerCase() : store.users[idx].email,
      phone: phone !== undefined ? phone : store.users[idx].phone,
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
