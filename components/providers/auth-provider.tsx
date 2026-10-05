'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { UserProfile, UserRole, Permission } from '@/types';
import { store } from '@/lib/services/data-store';
import { ROLE_PERMISSIONS, hasPermission as checkRbacPermission } from '@/lib/auth/rbac';
import { getDb, isLiveSupabaseEnabled } from '@/lib/supabase/db';
import {
  AUTH_COOKIE_NAME,
  AUTH_SIG_COOKIE_NAME,
  generateAuthCookieSignature,
} from '@/lib/security/auth-cookie';

export interface AuthContextType {
  user: UserProfile | null;
  role: UserRole;
  avatar: string;
  permissions: Permission[];
  permissionMatrix: Record<Permission, boolean>;
  isLoading: boolean;
  login: (email: string, password?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  switchRole: (role: UserRole) => void;
  hasPermission: (permission: Permission) => boolean;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

let memoryCookieStorage = '';
let memorySigCookieStorage = '';

const USER_ROLES: UserRole[] = [
  'super_admin',
  'admin',
  'accountant',
  'counsellor',
  'trainer',
  'placement_coordinator',
  'support',
  'student',
];

function isUserRole(role: unknown): role is UserRole {
  return typeof role === 'string' && USER_ROLES.includes(role as UserRole);
}

async function loadApplicationProfile(
  db: ReturnType<typeof getDb>,
  authUser: {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
    created_at?: string;
  }
): Promise<UserProfile | null> {
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load your application profile: ${error.message}`);
  }

  if (data) {
    if (!isUserRole(data.role)) {
      throw new Error('Your application profile has an invalid role. Contact the administrator.');
    }
    if (data.is_active === false) {
      throw new Error('This account is inactive. Contact the administrator.');
    }

    const metadataName = authUser.user_metadata?.full_name;
    return {
      ...data,
      id: authUser.id,
      email: data.email || authUser.email || '',
      full_name:
        data.full_name ||
        (typeof metadataName === 'string' ? metadataName : undefined) ||
        authUser.email?.split('@')[0] ||
        'User',
      role: data.role,
      is_active: true,
      created_at: data.created_at || authUser.created_at || new Date().toISOString(),
      updated_at: data.updated_at || new Date().toISOString(),
    };
  }

  // Live navigation requires a real profile; a local demo record cannot satisfy
  // the server's profile check and would otherwise create a login redirect loop.
  if (isLiveSupabaseEnabled()) return null;

  return store.users.find(
    (profile) =>
      profile.id === authUser.id ||
      profile.email.toLowerCase() === authUser.email?.toLowerCase()
  ) || null;
}

export function getAvatarUrl(user: UserProfile | null): string {
  if (user?.avatar_url) return user.avatar_url;
  const name = user?.full_name || user?.email || 'User';
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0A6ED1&color=fff&bold=true`;
}

export async function setAuthCookie(user: UserProfile) {
  const val = encodeURIComponent(
    JSON.stringify({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      avatar_url: user.avatar_url,
      is_active: user.is_active,
    })
  );

  memoryCookieStorage = `${AUTH_COOKIE_NAME}=${val}`;

  if (typeof document !== 'undefined') {
    document.cookie = `${AUTH_COOKIE_NAME}=${val}; path=/; max-age=604800; SameSite=Lax`;
  }

  // Generate and set HMAC signature cookie
  await generateAuthCookieSignature(val)
    .then((sig) => {
      memorySigCookieStorage = `${AUTH_SIG_COOKIE_NAME}=${sig}`;
      if (typeof document !== 'undefined') {
        document.cookie = `${AUTH_SIG_COOKIE_NAME}=${sig}; path=/; max-age=604800; SameSite=Lax`;
      }
    })
    .catch(() => {});

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(AUTH_COOKIE_NAME, JSON.stringify(user));
    } catch {}
  }
}

export function clearAuthCookie() {
  memoryCookieStorage = '';
  memorySigCookieStorage = '';
  if (typeof document !== 'undefined') {
    document.cookie = `${AUTH_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
    document.cookie = `${AUTH_SIG_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
  }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(AUTH_COOKIE_NAME);
    } catch {}
  }
}

export function getStoredUser(): UserProfile | null {
  try {
    let cookieStr = '';
    if (typeof document !== 'undefined') {
      cookieStr = document.cookie;
    } else if (memoryCookieStorage) {
      cookieStr = memoryCookieStorage;
    }

    if (cookieStr) {
      const cookies = cookieStr.split('; ');
      const authCookie = cookies.find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
      if (authCookie) {
        const raw = decodeURIComponent(authCookie.split('=')[1]);
        const parsed = JSON.parse(raw);
        // Match full record from store
        const full = store.users.find((u) => u.email.toLowerCase() === parsed.email?.toLowerCase());
        if (full) return full;
        return parsed as UserProfile;
      }
    }

    if (typeof localStorage !== 'undefined') {
      const local = localStorage.getItem(AUTH_COOKIE_NAME);
      if (local) {
        const parsed = JSON.parse(local);
        const full = store.users.find((u) => u.email.toLowerCase() === parsed.email?.toLowerCase());
        if (full) return full;
        return parsed as UserProfile;
      }
    }
  } catch {}

  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  // Server and first browser render must match. Restore the profile in the
  // effect below, after hydration, rather than reading browser storage here.
  const [user, setUser] = React.useState<UserProfile | null>(null);
  const [role, setRole] = React.useState<UserRole>('super_admin');
  const [isLoading, setIsLoading] = React.useState(true);

  // Read supabase.auth.getUser() on mount and sync global auth state
  React.useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        const db = getDb();
        const { data, error } = await db.auth.getUser();

        if (data?.user && !error) {
          const authUser = data.user;
          const profile = await loadApplicationProfile(db, authUser);

          if (isMounted) {
            if (profile) {
              setUser(profile);
              setRole(profile.role);
              setAuthCookie(profile);
              if (typeof localStorage !== 'undefined') {
                localStorage.setItem(AUTH_COOKIE_NAME, JSON.stringify(profile));
              }
            } else {
              setUser(null);
              clearAuthCookie();
            }
          }
        } else {
          // If no active session from Supabase, fall back to cached user or null
          const cached = getStoredUser();
          if (cached && isMounted) {
            setUser(cached);
            setRole(cached.role);
          } else if (isMounted) {
            setUser(null);
            setRole('super_admin');
          }
        }
      } catch (err) {
        console.warn('[AuthProvider] supabase.auth.getUser() error:', err);
        if (isMounted) {
          setUser(null);
          clearAuthCookie();
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen to Supabase auth state change events if available
    try {
      const db = getDb();
      if (db?.auth?.onAuthStateChange) {
        const { data: authListener } = db.auth.onAuthStateChange(async (_event: string, session: any) => {
          if (session?.user) {
            const authUser = session.user;
            void loadApplicationProfile(db, authUser).then((profile) => {
              if (!isMounted) return;
              if (profile) {
                setUser(profile);
                setRole(profile.role);
                setAuthCookie(profile);
              } else {
                setUser(null);
                clearAuthCookie();
              }
            }).catch((err) => {
              console.warn('[AuthProvider] Unable to load application profile:', err);
              if (isMounted) {
                setUser(null);
                clearAuthCookie();
              }
            });
          } else if (_event === 'SIGNED_OUT') {
            if (isMounted) {
              setUser(null);
              setRole('super_admin');
              clearAuthCookie();
            }
          }
        });
        return () => {
          isMounted = false;
          authListener?.subscription?.unsubscribe();
        };
      }
    } catch {}

    return () => {
      isMounted = false;
    };
  }, []);

  // Compute avatar URL globally
  const avatar = React.useMemo(() => getAvatarUrl(user), [user]);

  // Compute active permissions array globally based on current role
  const permissions: Permission[] = React.useMemo(() => {
    if (!user || !user.is_active) return [];
    if (role === 'super_admin') {
      return Array.from(new Set(Object.values(ROLE_PERMISSIONS).flat())) as Permission[];
    }
    return ROLE_PERMISSIONS[role] || [];
  }, [user, role]);

  // Compute boolean permission matrix globally
  const permissionMatrix: Record<Permission, boolean> = React.useMemo(() => {
    const allPerms = Array.from(new Set(Object.values(ROLE_PERMISSIONS).flat())) as Permission[];
    const map: Partial<Record<Permission, boolean>> = {};
    for (const perm of allPerms) {
      map[perm] = role === 'super_admin' ? true : permissions.includes(perm);
    }
    return map as Record<Permission, boolean>;
  }, [role, permissions]);

  const hasPermission = React.useCallback(
    (permission: Permission): boolean => {
      if (!user || !user.is_active) return false;
      if (role === 'super_admin') return true;
      return Boolean(permissionMatrix[permission]);
    },
    [user, role, permissionMatrix]
  );

  const login = async (email: string, password?: string): Promise<boolean> => {
    setIsLoading(true);

    try {
      // 1. If Supabase is live, attempt genuine login
      if (isLiveSupabaseEnabled() && password) {
        const db = getDb();
        const { data, error } = await db.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          throw error;
        }

        const authUser = data?.user;
        if (!authUser) {
          throw new Error('Supabase sign-in succeeded without returning a user.');
        }

        const profile = await loadApplicationProfile(db, authUser);
        if (!profile) {
          await db.auth.signOut();
          throw new Error('No LMS profile is set up for this account. Contact the administrator.');
        }

        setUser(profile);
        setRole(profile.role);
        await setAuthCookie(profile);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(AUTH_COOKIE_NAME, JSON.stringify(profile));
        }

        const destination = {
          student: '/portal', support: '/support', accountant: '/accounts/fees',
          counsellor: '/crm/leads', placement_coordinator: '/placement',
          trainer: '/academics/courses', admin: '/dashboard', super_admin: '/dashboard',
        }[profile.role];
        // Request the destination with the completed session cookies, avoiding
        // a cached unauthenticated App Router response from before sign-in.
        window.location.assign(destination);
        return true;
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
      await setAuthCookie(matched);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(AUTH_COOKIE_NAME, JSON.stringify(matched));
      }

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

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        avatar,
        permissions,
        permissionMatrix,
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
