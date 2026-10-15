import { store } from './data-store';
import { UserProfile, UserRole } from '@/types';

// Default active session in application (can switch role dynamically)
let activeUserId = 'usr-superadmin';

export async function getCurrentUser(): Promise<UserProfile> {
  const user = store.users.find((u) => u.id === activeUserId);
  if (!user) {
    return store.users[0]; // fallback to super admin
  }
  return user;
}

export async function setActiveUser(userId: string): Promise<UserProfile> {
  const user = store.users.find((u) => u.id === userId);
  if (user) {
    activeUserId = user.id;
    return user;
  }
  return store.users[0];
}

export async function setActiveRole(role: UserRole): Promise<UserProfile> {
  const user = store.users.find((u) => u.role === role);
  if (user) {
    activeUserId = user.id;
    return user;
  }
  return store.users[0];
}

export async function getAllUsers(): Promise<UserProfile[]> {
  return [...store.users];
}

export async function createUser(data: Partial<UserProfile>): Promise<UserProfile> {
  const newUser: UserProfile = {
    id: `usr-${Date.now()}`,
    email: data.email || 'user@next-generpsolutions.com',
    full_name: data.full_name || 'New Staff Member',
    role: data.role || 'trainer',
    phone: data.phone,
    is_active: true,
    assigned_course_ids: data.assigned_course_ids || [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  store.users.push(newUser);
  store.persist();
  return newUser;
}

export async function updateUser(userId: string, data: Partial<UserProfile>): Promise<UserProfile | null> {
  const idx = store.users.findIndex((u) => u.id === userId);
  if (idx === -1) return null;
  store.users[idx] = {
    ...store.users[idx],
    ...data,
    updated_at: new Date().toISOString(),
  };
  store.persist();
  return store.users[idx];
}

export async function setUserActiveStatus(
  userId: string,
  isActive: boolean,
  actorUserId?: string
): Promise<UserProfile | null> {
  if (actorUserId && userId === actorUserId && !isActive) {
    throw new Error('You cannot deactivate your own account.');
  }
  return updateUser(userId, { is_active: isActive });
}

export async function generatePasswordResetLink(userId: string): Promise<{ resetToken: string; resetLink: string; user: UserProfile } | null> {
  const user = store.users.find((u) => u.id === userId);
  if (!user) return null;
  const resetToken = `rst_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://lms.next-generpsolutions.com';
  const resetLink = `${baseUrl}/login?reset_token=${resetToken}&email=${encodeURIComponent(user.email)}`;
  return { resetToken, resetLink, user };
}

