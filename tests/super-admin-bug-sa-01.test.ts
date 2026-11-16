import { describe, it, expect } from 'vitest';
import { createClient } from '@/lib/supabase/db';
import { getBatches } from '@/lib/services/academics-service';
import { store } from '@/lib/services/data-store';

describe('BUG-SA-01: Batch Query Error (.range is not a function)', () => {
  it('exposes a working .range(from, to) method on the Supabase query builder without throwing', async () => {
    const supabase = createClient();
    const query = supabase.from('batches').select('*');

    expect(typeof query.range).toBe('function');

    const result = await query.range(0, 5);
    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('correctly slices records according to range bounds', async () => {
    const adminUser = {
      id: 'usr-admin-test',
      email: 'admin@test.com',
      full_name: 'Admin User',
      role: 'admin' as const,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const supabase = createClient(adminUser);

    // Ensure we have at least 3 batches in store
    store.batches = [
      { id: 'b-01', batch_name: 'Batch 1', batch_code: 'B1', course_id: 'c1', current_enrolled: 5, maximum_capacity: 25, status: 'Active', start_date: '2026-01-01', created_at: '2026-01-01' },
      { id: 'b-02', batch_name: 'Batch 2', batch_code: 'B2', course_id: 'c1', current_enrolled: 10, maximum_capacity: 25, status: 'Active', start_date: '2026-01-02', created_at: '2026-01-02' },
      { id: 'b-03', batch_name: 'Batch 3', batch_code: 'B3', course_id: 'c1', current_enrolled: 15, maximum_capacity: 25, status: 'Active', start_date: '2026-01-03', created_at: '2026-01-03' },
    ] as any;

    const page1 = await supabase.from('batches').select('*').order('created_at', { ascending: true }).range(0, 1);
    expect(page1.error).toBeNull();
    expect(page1.data).toHaveLength(2);
    expect(page1.data[0].id).toBe('b-01');
    expect(page1.data[1].id).toBe('b-02');

    const page2 = await supabase.from('batches').select('*').order('created_at', { ascending: true }).range(2, 3);
    expect(page2.error).toBeNull();
    expect(page2.data).toHaveLength(1);
    expect(page2.data[0].id).toBe('b-03');
  });

  it('handles empty-result behavior gracefully when range is beyond dataset length', async () => {
    const adminUser = {
      id: 'usr-admin-test',
      email: 'admin@test.com',
      full_name: 'Admin User',
      role: 'admin' as const,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const supabase = createClient(adminUser);
    const beyondRange = await supabase.from('batches').select('*').range(100, 150);

    expect(beyondRange.error).toBeNull();
    expect(Array.isArray(beyondRange.data)).toBe(true);
    expect(beyondRange.data).toHaveLength(0);
  });

  it('executes getBatches without throwing .range is not a function exception', async () => {
    await expect(getBatches()).resolves.toBeDefined();
    const batches = await getBatches();
    expect(Array.isArray(batches)).toBe(true);
  });
});
