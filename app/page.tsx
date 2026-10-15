import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTH_COOKIE_NAME } from '@/lib/security/auth-cookie';
import { DEFAULT_ROLE_ROUTES } from '@/lib/auth/rbac';
import { UserRole } from '@/types';

export default async function RootPage() {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (authCookie) {
    try {
      const parsed = JSON.parse(decodeURIComponent(authCookie));
      const role = (parsed?.payload?.role || parsed?.role) as UserRole;
      const destination = DEFAULT_ROLE_ROUTES[role] || '/dashboard';

      redirect(destination);
    } catch {}
  }

  redirect('/login');
}
