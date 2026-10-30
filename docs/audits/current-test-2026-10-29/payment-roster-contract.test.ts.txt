import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/lib/supabase/db', () => ({ isLiveSupabaseEnabled: () => true }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  from: (table: string) => ({ select: () => ({ eq: (_column: string, tenant: string) => {
    const task = mocks.query(table, tenant);
    return Object.assign(task, { maybeSingle: () => task });
  } }) }),
}) }));
import { paymentTransaction } from '@/lib/services/payment-workflow-transaction';
import { store } from '@/lib/services/data-store';
import type { UserProfile } from '@/types';
const actor = { id: 'reader', tenant_id: 'read-test', role: 'accountant', is_active: true } as UserProfile;
afterEach(() => vi.restoreAllMocks());

it('starts snapshot and current roster reads together while preserving tenant filters', async () => {
  let finishState!: (value: unknown) => void;
  const state = new Promise((resolve) => { finishState = resolve; });
  mocks.query.mockImplementation((table) => table === 'fee_workflow_state' ? state : Promise.resolve({ data: [actor], error: null }));
  const operation = vi.fn(() => store.users.find((user) => user.id === actor.id));
  const task = paymentTransaction(actor, operation, true);
  await vi.waitFor(() => expect(mocks.query).toHaveBeenCalledWith('profiles', 'read-test'));
  expect(mocks.query).toHaveBeenCalledWith('fee_workflow_state', 'read-test');
  expect(operation).not.toHaveBeenCalled();
  finishState({ data: { revision: 1, snapshot: {} }, error: null });
  await expect(task).resolves.toEqual(actor);
});

it('does not run an operation if the current roster cannot be verified', async () => {
  mocks.query.mockImplementation((table) => Promise.resolve(table === 'profiles'
    ? { data: null, error: { message: 'unavailable' } }
    : { data: { revision: 1, snapshot: {} }, error: null }));
  const operation = vi.fn();
  await expect(paymentTransaction(actor, operation, true)).rejects.toThrow('current staff roster');
  expect(operation).not.toHaveBeenCalled();
});

it('rejects a removed live actor before invoking the operation', async () => {
  mocks.query.mockImplementation((table) => Promise.resolve(table === 'profiles' ? { data: [], error: null } : { data: { revision: 1, snapshot: {} }, error: null }));
  const operation = vi.fn();
  const outcome = await paymentTransaction(actor, operation, true).then(() => 'resolved', () => 'rejected');
  expect(operation).not.toHaveBeenCalled();
  expect(outcome).toBe('rejected');
});

it('rejects a deactivated live actor before invoking the operation', async () => {
  mocks.query.mockImplementation((table) => Promise.resolve(table === 'profiles' ? { data: [{ ...actor, is_active: false }], error: null } : { data: { revision: 1, snapshot: {} }, error: null }));
  const operation = vi.fn();
  const outcome = await paymentTransaction(actor, operation, true).then(() => 'resolved', () => 'rejected');
  expect(operation).not.toHaveBeenCalled();
  expect(outcome).toBe('rejected');
});

