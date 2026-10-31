import { expect, it } from 'vitest';
import { classifyTarget } from '@/lib/security/database-preflight';
it('does not certify an arbitrary remote host just because its name includes mock', () => {
  expect(classifyTarget('https://mock-production.example.invalid').verified).toBe(false);
});
it('does not certify a lookalike Supabase domain as an allowlisted project', () => {
  expect(classifyTarget('https://neiccpnxftfmmwnvtgdy.evilsupabase.co').verified).toBe(false);
});
it('does not treat an uninspected database on a common localhost port as verified isolation', () => {
  expect(classifyTarget('http://localhost:5432').verified).toBe(false);
});
