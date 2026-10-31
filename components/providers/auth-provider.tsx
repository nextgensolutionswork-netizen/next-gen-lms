'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { UserProfile, UserRole, Permission } from '@/types';
import { store } from '@/lib/services/data-store';
import { ROLE_PERMISSIONS, hasPermission as checkRbacPermission, getSafeRedirectUrl } from '@/lib/auth/rbac';
import { getDb, isLiveSupabaseEnabled } from '@/lib/supabase/db';
import {
  AUTH_COOKIE_NAME,
  AUTH_SIG_COOKIE_NAME,
  generateAuthCookieSignature,
} from '@/lib/security/auth-cookie';
import { verifyUserCredentials, validateLoginPreflight } from '@/lib/auth/credentials';
export { validateLoginPreflight };

export interface AuthContextType {
  user: UserProfile | null;
  role: UserRole;
  avatar: string;
  permissions: Permission[];
  permissionMatrix: Record<Permission, boolean>;
  isLoading: boolean;
  login: (email: string, password?: string, redirectTo?: string) => Promise<boolean>;
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
  'onboarding_team',
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
  try {
    const { data, error } = await db
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();

    if (error) {
      console.warn(`[AuthProvider] profiles query warning: ${error.message}`);
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
  } catch (err: any) {
    if (err?.message?.includes('invalid role') || err?.message?.includes('inactive')) {
      throw err;
    }
    console.warn('[AuthProvider] loadApplicationProfile query exception:', err?.message);
  }

  // Fallback to local store user profile if remote database profile row does not exist yet
  if (isLiveSupabaseEnabled() || (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development')) return null;
  return (
    store.users.find(
      (profile) =>
        profile.id === authUser.id ||
        (authUser.email && profile.email.toLowerCase() === authUser.email.toLowerCase())
    ) || null
  );
}

export function getAvatarUrl(user: UserProfile | null): string {
  if (user?.avatar_url) return user.avatar_url;
  const name = user?.full_name || user?.email || 'User';
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0A6ED1&color=fff&bold=true`;
}

export async function setAuthCookie(user: UserProfile) {
  if (!user) return;
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
        // Server cookie serialization may encode the already encoded JSON once
        // more. Browser-written cookies have only one layer.
        let raw = decodeURIComponent(authCookie.slice(authCookie.indexOf('=') + 1));
        if (raw.startsWith('%7B')) raw = decodeURIComponent(raw);
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
          const cached = !isLiveSupabaseEnabled() && (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') ? getStoredUser() : null;
          if (cached && isMounted) {
            setUser(cached);
            setRole(cached.role);
          } else if (isMounted) {
            setUser(null);
            setRole('super_admin');
            clearAuthCookie();
          }
        }
      } catch (err) {
        console.warn('[AuthProvider] supabase.auth.getUser() error, falling back to cached session:', err);
        const cached = !isLiveSupabaseEnabled() && (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') ? getStoredUser() : null;
        if (cached && isMounted) {
          setUser(cached);
          setRole(cached.role);
        } else if (isMounted) {
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

  const login = async (email: string, password?: string, redirectTo?: string): Promise<boolean> => {
    setIsLoading(true);

    try {
      // 1. If Supabase is live, attempt genuine login
      if (isLiveSupabaseEnabled() && password) {
        try {
          const db = getDb();
          const { data, error } = await db.auth.signInWithPassword({ email: email.trim(), password });
          if (!error && data?.user) {
            const authUser = data.user;
            const profile = await loadApplicationProfile(db, authUser);
            if (profile) {
              validateLoginPreflight(profile);

              setUser(profile);
              setRole(profile.role);
              await setAuthCookie(profile);
              if (typeof localStorage !== 'undefined') {
                localStorage.setItem(AUTH_COOKIE_NAME, JSON.stringify(profile));
              }

              const target =
                redirectTo ||
                (typeof window !== 'undefined'
                  ? new URLSearchParams(window.location.search).get('redirectTo')
                  : null);
              const destination = getSafeRedirectUrl(profile.role, target);

              if (typeof window !== 'undefined' && window.location?.assign) {
                window.location.assign(destination);
              } else {
                router.replace(destination);
              }
              return true;
            }
          } else if (error) {
            throw new Error('Unable to sign in. Check your credentials and try again.');
          }
        } catch (supaErr: any) {
          if (supaErr?.message?.includes('pending onboarding') || supaErr?.message?.includes('deactivated')) {
            throw supaErr;
          }
          throw new Error('Unable to sign in. Authentication is unavailable or the session was rejected.');
        }
        throw new Error('Your application profile is unavailable. Contact your administrator.');
      }

      // 2. Validate credentials safely via verifyUserCredentials
      const verification = await verifyUserCredentials(email, password);
      if (!verification.success || !verification.user) {
        throw new Error(verification.error || 'Unable to sign in. Check your email and password and try again.');
      }

      const matched = verification.user;

      setUser(matched);
      setRole(matched.role);
      await setAuthCookie(matched);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(AUTH_COOKIE_NAME, JSON.stringify(matched));
      }

      // 3. Smart routing based on role or safe redirectTo query parameter
      const target =
        redirectTo ||
        (typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('redirectTo')
          : null);
      const destination = getSafeRedirectUrl(matched.role, target);

      if (typeof window !== 'undefined' && window.location?.assign) {
        window.location.assign(destination);
      } else {
        router.replace(destination);
      }
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
