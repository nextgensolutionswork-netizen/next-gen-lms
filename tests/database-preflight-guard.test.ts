import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  assertIsolatedQaDatabase,
  assertTargetApplicationIsolatedQa,
  classifyTarget,
  extractProjectIdentifier,
  isProductionDatabase,
  KNOWN_PRODUCTION_PROJECT_REFS,
  VERIFIED_REMOTE_QA_PROJECTS,
  VERIFIED_LOCAL_INSTANCES,
  VERIFIED_MOCKS,
} from '@/lib/security/database-preflight';

describe('Database Preflight Mutation Isolation Guard Tests', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('extractProjectIdentifier', () => {
    it('extracts Supabase project ref from standard cloud hostname', () => {
      expect(extractProjectIdentifier('https://tgohtdzwehhjfahtgovq.supabase.co')).toBe('tgohtdzwehhjfahtgovq');
      expect(extractProjectIdentifier('https://neiccpnxftfmmwnvtgdy.supabase.co')).toBe('neiccpnxftfmmwnvtgdy');
      expect(extractProjectIdentifier('http://myproject.supabase.co/rest/v1')).toBe('myproject');
    });

    it('extracts local host with instance port', () => {
      expect(extractProjectIdentifier('http://127.0.0.1:54321')).toBe('127.0.0.1:54321');
      expect(extractProjectIdentifier('http://localhost:54321')).toBe('localhost:54321');
    });

    it('extracts host from standard URLs or raw identifiers', () => {
      expect(extractProjectIdentifier('tgohtdzwehhjfahtgovq')).toBe('tgohtdzwehhjfahtgovq');
      expect(extractProjectIdentifier('')).toBe('');
      expect(extractProjectIdentifier(null)).toBe('');
    });
  });

  describe('isProductionDatabase', () => {
    it('accurately identifies production project ref and URL', () => {
      expect(isProductionDatabase('https://tgohtdzwehhjfahtgovq.supabase.co')).toBe(true);
      expect(isProductionDatabase('tgohtdzwehhjfahtgovq')).toBe(true);
      expect(isProductionDatabase('https://neiccpnxftfmmwnvtgdy.supabase.co')).toBe(false);
      expect(isProductionDatabase('http://localhost:54321')).toBe(false);
    });
  });

  describe('classifyTarget Environment Separation', () => {
    it('separates verified remote QA, local instance, mock, and production', () => {
      expect(classifyTarget('https://tgohtdzwehhjfahtgovq.supabase.co').type).toBe('production');
      expect(classifyTarget('https://neiccpnxftfmmwnvtgdy.supabase.co').type).toBe('remote_qa');
      expect(classifyTarget('http://127.0.0.1:54321').type).toBe('local_instance');
      expect(classifyTarget('mock-sap-lms').type).toBe('mock');
    });

    it('refuses bare localhost or 127.0.0.1 without verified instance port', () => {
      const bareLocal = classifyTarget('http://localhost');
      expect(bareLocal.verified).toBe(false);
      expect(bareLocal.reason).toMatch(/Localhost alone is not proof/i);

      const bareIp = classifyTarget('http://127.0.0.1');
      expect(bareIp.verified).toBe(false);
      expect(bareIp.reason).toMatch(/Localhost alone is not proof/i);
    });

    it('refuses staging-like labels that are not explicitly allowlisted', () => {
      const fakeStaging = classifyTarget('https://fake-staging.supabase.co');
      expect(fakeStaging.verified).toBe(false);
      expect(fakeStaging.reason).toMatch(/Staging labels alone are not proof of isolation/i);

      const unverifiedStaging = classifyTarget('staging-cluster');
      expect(unverifiedStaging.verified).toBe(false);
      expect(unverifiedStaging.reason).toMatch(/Staging labels alone are not proof of isolation/i);
    });
  });

  describe('assertIsolatedQaDatabase Fail-Closed Enforcement', () => {
    it('strictly refuses mutation against production URL, regardless of NODE_ENV', () => {
      for (const envMode of ['development', 'test', 'staging', 'production', 'local']) {
        (process.env as any).NODE_ENV = envMode;
        expect(() =>
          assertIsolatedQaDatabase('https://tgohtdzwehhjfahtgovq.supabase.co')
        ).toThrow(/PRODUCTION database.*strictly prohibited/i);
      }
    });

    it('strictly refuses mutation against production even if running on localhost proxy or custom branch', () => {
      (process.env as any).NODE_ENV = 'development';
      (process.env as any).GIT_BRANCH = 'staging';
      (process.env as any).NEXT_PUBLIC_APP_URL = 'http://localhost:3001';

      expect(() =>
        assertIsolatedQaDatabase('https://tgohtdzwehhjfahtgovq.supabase.co')
      ).toThrow(/PRODUCTION database/i);
    });

    it('purges production ref even if injected into ALLOWED_ISOLATED_QA_PROJECTS', () => {
      process.env.ALLOWED_ISOLATED_QA_PROJECTS = 'tgohtdzwehhjfahtgovq,neiccpnxftfmmwnvtgdy';

      expect(() =>
        assertIsolatedQaDatabase('https://tgohtdzwehhjfahtgovq.supabase.co')
      ).toThrow(/PRODUCTION database/i);
    });

    it('refuses unverified or unknown third-party databases', () => {
      expect(() =>
        assertIsolatedQaDatabase('https://random-unverified-project.supabase.co')
      ).toThrow(/NOT verified/i);
    });

    it('refuses when database URL is missing or empty', () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.DATABASE_URL;

      expect(() => assertIsolatedQaDatabase(null)).toThrow(
        /No target database URL provided/i
      );
    });

    it('permits allowlisted verified staging database', () => {
      const result = assertIsolatedQaDatabase('https://neiccpnxftfmmwnvtgdy.supabase.co');
      expect(result.allowed).toBe(true);
      expect(result.project).toBe('neiccpnxftfmmwnvtgdy');
      expect(result.targetType).toBe('remote_qa');
    });

    it('permits verified local instance and mock database environments', () => {
      const mockResult = assertIsolatedQaDatabase('https://mock-sap-lms.supabase.co');
      expect(mockResult.allowed).toBe(true);
      expect(mockResult.project).toBe('mock-sap-lms');
      expect(mockResult.targetType).toBe('mock');

      const localResult = assertIsolatedQaDatabase('http://127.0.0.1:54321');
      expect(localResult.allowed).toBe(true);
      expect(localResult.project).toBe('127.0.0.1:54321');
      expect(localResult.targetType).toBe('local_instance');
    });

    it('permits custom allowlisted QA project via environment variable', () => {
      process.env.ALLOWED_ISOLATED_QA_PROJECTS = 'my-custom-qa-cluster,another-qa-host';

      const result = assertIsolatedQaDatabase('https://my-custom-qa-cluster.supabase.co');
      expect(result.allowed).toBe(true);
      expect(result.project).toBe('my-custom-qa-cluster');
      expect(result.targetType).toBe('remote_qa');
    });
  });

  describe('assertTargetApplicationIsolatedQa Destination & Consistency Gates', () => {
    it('strictly refuses mutation when target application reports production database', async () => {
      const mockFetch = async () => ({
        ok: true,
        json: async () => ({
          success: true,
          databaseProject: 'tgohtdzwehhjfahtgovq',
          isLive: true,
        }),
      } as Response);

      await expect(
        assertTargetApplicationIsolatedQa('http://localhost:3000', { fetchFn: mockFetch })
      ).rejects.toThrow(/PRODUCTION database.*strictly prohibited/i);
    });

    it('strictly refuses target application with staging-like name that is not an exact verified allowlisted ID', async () => {
      const mockFetch = async () => ({
        ok: true,
        json: async () => ({
          success: true,
          databaseProject: 'staging-unauthorized-cluster',
          isLive: true,
        }),
      } as Response);

      await expect(
        assertTargetApplicationIsolatedQa('http://localhost:3000', { fetchFn: mockFetch })
      ).rejects.toThrow(/Staging labels alone are not proof/i);
    });

    it('strictly refuses target application with inconsistent database and storage destinations', async () => {
      const mockFetch = async () => ({
        ok: true,
        json: async () => ({
          success: true,
          databaseProject: 'neiccpnxftfmmwnvtgdy',
          storageProject: 'tgohtdzwehhjfahtgovq', // Mismatched / production storage!
          storageBackend: 'supabase_storage',
          isLive: true,
        }),
      } as Response);

      await expect(
        assertTargetApplicationIsolatedQa('http://localhost:3000', { fetchFn: mockFetch })
      ).rejects.toThrow(/PRODUCTION database/i);
    });

    it('strictly refuses target application when database and storage projects differ in live mode', async () => {
      process.env.ALLOWED_ISOLATED_QA_PROJECTS = 'qa-db-alt';
      const mockFetch = async () => ({
        ok: true,
        json: async () => ({
          success: true,
          databaseProject: 'neiccpnxftfmmwnvtgdy',
          storageProject: 'qa-db-alt',
          storageBackend: 'supabase_storage',
          isLive: true,
        }),
      } as Response);

      await expect(
        assertTargetApplicationIsolatedQa('http://localhost:3000', { fetchFn: mockFetch })
      ).rejects.toThrow(/Inconsistent target configuration/i);
    });

    it('strictly refuses target application when live mode has local_disk_mock storage backend', async () => {
      const mockFetch = async () => ({
        ok: true,
        json: async () => ({
          success: true,
          databaseProject: 'neiccpnxftfmmwnvtgdy',
          storageProject: 'neiccpnxftfmmwnvtgdy',
          storageBackend: 'local_disk_mock', // Inconsistent with live!
          isLive: true,
        }),
      } as Response);

      await expect(
        assertTargetApplicationIsolatedQa('http://localhost:3000', { fetchFn: mockFetch })
      ).rejects.toThrow(/Live mutations require consistent verified remote storage/i);
    });

    it('strictly refuses target application when mock mode points to remote QA storage', async () => {
      const mockFetch = async () => ({
        ok: true,
        json: async () => ({
          success: true,
          databaseProject: 'mock-sap-lms',
          storageProject: 'neiccpnxftfmmwnvtgdy',
          storageBackend: 'supabase_storage',
          isLive: false,
        }),
      } as Response);

      await expect(
        assertTargetApplicationIsolatedQa('http://localhost:3000', { fetchFn: mockFetch })
      ).rejects.toThrow(/reports non-live mode, but configured destination points to remote QA/i);
    });

    it('strictly refuses when target application health check fails or errors', async () => {
      const failingFetch = async () => {
        throw new Error('Connection refused');
      };

      await expect(
        assertTargetApplicationIsolatedQa('http://localhost:3000', { fetchFn: failingFetch })
      ).rejects.toThrow(/Could not probe target application database configuration/i);
    });

    it('strictly refuses when target application returns non-200 HTTP status', async () => {
      const errorFetch = async () => ({
        ok: false,
        status: 503,
      } as Response);

      await expect(
        assertTargetApplicationIsolatedQa('http://localhost:3000', { fetchFn: errorFetch })
      ).rejects.toThrow(/health probe returned HTTP 503/i);
    });

    it('accepts fully verified isolated QA application with consistent destinations', async () => {
      const validFetch = async () => ({
        ok: true,
        json: async () => ({
          success: true,
          databaseProject: 'neiccpnxftfmmwnvtgdy',
          storageProject: 'neiccpnxftfmmwnvtgdy',
          storageBackend: 'supabase_storage',
          isLive: true,
        }),
      } as Response);

      const result = await assertTargetApplicationIsolatedQa('http://localhost:3000', { fetchFn: validFetch });
      expect(result.allowed).toBe(true);
      expect(result.database.project).toBe('neiccpnxftfmmwnvtgdy');
      expect(result.storage.project).toBe('neiccpnxftfmmwnvtgdy');
      expect(result.isLive).toBe(true);
    });

    it('accepts fully verified mock application with consistent mock destinations', async () => {
      const mockFetch = async () => ({
        ok: true,
        json: async () => ({
          success: true,
          databaseProject: 'mock-sap-lms',
          storageProject: 'mock-sap-lms',
          storageBackend: 'local_disk_mock',
          isLive: false,
        }),
      } as Response);

      const result = await assertTargetApplicationIsolatedQa('http://localhost:3000', { fetchFn: mockFetch });
      expect(result.allowed).toBe(true);
      expect(result.database.project).toBe('mock-sap-lms');
      expect(result.isLive).toBe(false);
    });
  });
});
