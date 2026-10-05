import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/components/providers/auth-provider';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/dashboard',
}));

afterEach(() => vi.unstubAllGlobals());

function Profile() {
  const { user, role, isLoading } = useAuth();
  return <span>{JSON.stringify({ user, role, isLoading })}</span>;
}

it('matches the server render when the browser has a saved admin profile', () => {
  const render = () => renderToString(<AuthProvider><Profile /></AuthProvider>);
  const serverHtml = render();
  const saved = JSON.stringify({ id: 'admin-user', email: 'admin@example.com', role: 'admin' });
  const readStorage = vi.fn(() => saved);
  vi.stubGlobal('localStorage', { getItem: readStorage });
  vi.stubGlobal('document', { cookie: `next_gen_auth_user=${encodeURIComponent(saved)}` });
  expect(render()).toBe(serverHtml);
  expect(readStorage).not.toHaveBeenCalled();
});
