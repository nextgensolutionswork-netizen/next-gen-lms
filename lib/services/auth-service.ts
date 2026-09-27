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
  return newUser;
}
