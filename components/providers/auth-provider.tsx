'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { UserProfile, UserRole, Permission } from '@/types';
import { store } from '@/lib/services/data-store';
import { hasPermission as checkRbacPermission } from '@/lib/auth/rbac';
import { getDb, isLiveSupabaseEnabled } from '@/lib/supabase/db';

export interface AuthContextType {
  user: UserProfile | null;
  role: UserRole;
  isLoading: boolean;
  login: (email: string, password?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  switchRole: (role: UserRole) => void;
  hasPermission: (permission: Permission) => boolean;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

const AUTH_COOKIE_NAME = 'next_gen_auth_user';

function setAuthCookie(user: UserProfile) {
  if (typeof document === 'undefined') return;
  const val = encodeURIComponent(
    JSON.stringify({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
    })
  );
  document.cookie = `${AUTH_COOKIE_NAME}=${val}; path=/; max-age=604800; SameSite=Lax`;
}

function clearAuthCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
}

function getStoredUser(): UserProfile | null {
  if (typeof document === 'undefined') return null;

  try {
    const cookies = document.cookie.split('; ');
    const authCookie = cookies.find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
    if (authCookie) {
      const raw = decodeURIComponent(authCookie.split('=')[1]);
      const parsed = JSON.parse(raw);
      // Match full record from store
      const full = store.users.find((u) => u.email.toLowerCase() === parsed.email?.toLowerCase());
      if (full) return full;
      return parsed as UserProfile;
    }

    const local = localStorage.getItem(AUTH_COOKIE_NAME);
    if (local) {
      const parsed = JSON.parse(local);
      const full = store.users.find((u) => u.email.toLowerCase() === parsed.email?.toLowerCase());
      if (full) return full;
      return parsed as UserProfile;
    }
  } catch {}

  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = React.useState<UserProfile | null>(null);
  const [role, setRole] = React.useState<UserRole>('super_admin');
  const [isLoading, setIsLoading] = React.useState(true);

  // Initialize auth state on mount
  React.useEffect(() => {
    const initializeAuth = async () => {
      // 1. Try local cookie / localStorage
      const cached = getStoredUser();
      if (cached) {
        setUser(cached);
        setRole(cached.role);
      } else {
        setUser(null);
      }

      // 2. If live Supabase enabled, verify active session
      if (isLiveSupabaseEnabled()) {
        try {
          const db = getDb();
          const { data } = await db.auth.getUser();
          if (data.user?.email) {
            const matched = store.users.find(
              (u) => u.email.toLowerCase() === data.user?.email?.toLowerCase()
            );
            if (matched) {
              setUser(matched);
              setRole(matched.role);
              setAuthCookie(matched);
            }
          }
        } catch (err) {
          console.warn('Supabase auth session check failed:', err);
        }
      }

      setIsLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (email: string, password?: string): Promise<boolean> => {
    setIsLoading(true);

    try {
      // 1. If Supabase is live, attempt genuine login
      if (isLiveSupabaseEnabled() && password) {
        const db = getDb();
        const { error } = await db.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          throw error;
        }
      }

      // 2. Match profile from store
      const matched = store.users.find(
        (u) => u.email.toLowerCase() === email.trim().toLowerCase()
      );

      if (!matched) {
        throw new Error('User profile not found');
      }

      setUser(matched);
      setRole(matched.role);
      setAuthCookie(matched);
      localStorage.setItem(AUTH_COOKIE_NAME, JSON.stringify(matched));

      // 3. Smart routing based on role
      if (matched.role === 'student') {
        router.replace('/portal');
      } else if (matched.role === 'support') {
        router.replace('/support');
      } else if (matched.role === 'accountant') {
        router.replace('/accounts/fees');
      } else if (matched.role === 'counsellor') {
        router.replace('/crm/leads');
      } else if (matched.role === 'placement_coordinator') {
        router.replace('/placement');
      } else if (matched.role === 'trainer') {
        router.replace('/academics/courses');
      } else {
        router.replace('/dashboard');
      }

      router.refresh();
      return true;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      if (isLiveSupabaseEnabled()) {
        const db = getDb();
        await db.auth.signOut();
      }
    } catch {}

    clearAuthCookie();
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(AUTH_COOKIE_NAME);
    }

    setUser(null);
    setRole('super_admin');

    router.replace('/login');
    router.refresh();
    setIsLoading(false);
  };

  const switchRole = (newRole: UserRole) => {
    // Find representative user for this role
    const matched = store.users.find((u) => u.role === newRole) || {
      id: `usr-demo-${newRole}`,
      email: `${newRole}@next-generpsolutions.com`,
      full_name: `${newRole.toUpperCase()} Preview User`,
      role: newRole,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setUser(matched);
    setRole(newRole);
    setAuthCookie(matched);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AUTH_COOKIE_NAME, JSON.stringify(matched));
    }
  };

  const hasPermission = (permission: Permission): boolean => {
    if (!user) return false;
    return checkRbacPermission(user, permission);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isLoading,
        login,
        logout,
        switchRole,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
