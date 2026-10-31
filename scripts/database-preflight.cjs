/**
 * Database Preflight Isolation Guard (CommonJS)
 *
 * Strictly prevents mutation operations and test execution against unauthorized or production databases.
 * Validates every database and storage destination used by the target application before any mutation.
 * Separates verified remote QA projects, verified local database instances, and mocks.
 * Does NOT accept localhost or staging-like labels alone as proof of isolation.
 */

const KNOWN_PRODUCTION_PROJECT_REFS = new Set([
  'tgohtdzwehhjfahtgovq',
]);

const VERIFIED_REMOTE_QA_PROJECTS = new Set([
  'neiccpnxftfmmwnvtgdy', // Verified isolated staging Supabase project
]);

const VERIFIED_LOCAL_INSTANCES = new Set([
  '127.0.0.1:54321', // Local Supabase emulator CLI instance
  'localhost:54321',
]);

const VERIFIED_MOCKS = new Set([
  'mock-sap-lms',
]);

function extractProjectIdentifier(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed.startsWith('http') || trimmed.startsWith('postgres') ? trimmed : `https://${trimmed}`);
    const hostParts = parsed.hostname.split('.');
    if ((parsed.hostname.endsWith('.supabase.co') || parsed.hostname === 'supabase.co') && hostParts.length >= 3) {
      return hostParts[0].toLowerCase();
    }
    if (parsed.port && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')) {
      return `${parsed.hostname}:${parsed.port}`.toLowerCase();
    }
    return parsed.hostname.toLowerCase();
  } catch {
    const match = trimmed.match(/([a-z0-9_-]{15,})/i);
    return match ? match[1].toLowerCase() : trimmed.toLowerCase();
  }
}

function isProductionDatabase(urlOrRef) {
  if (!urlOrRef) return false;
  const project = extractProjectIdentifier(urlOrRef);
  if (KNOWN_PRODUCTION_PROJECT_REFS.has(project)) return true;
  return /tgohtdzwehhjfahtgovq/i.test(urlOrRef);
}

function classifyTarget(urlOrRef, options = {}) {
  if (!urlOrRef) {
    return { type: 'unverified', project: '', verified: false, reason: 'Empty destination' };
  }

  const project = extractProjectIdentifier(urlOrRef);

  // 1. Production Check
  if (isProductionDatabase(urlOrRef) || KNOWN_PRODUCTION_PROJECT_REFS.has(project)) {
    return {
      type: 'production',
      project,
      verified: false,
      reason: `Target '${project}' is a verified PRODUCTION database.`,
    };
  }

  // 2. Custom allowlist
  const envAllowlist = (process.env.ALLOWED_ISOLATED_QA_PROJECTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const customList = (options.customAllowlist || []).map((s) => s.toLowerCase());
  const userAllowed = new Set([...envAllowlist, ...customList]);

  for (const prodRef of KNOWN_PRODUCTION_PROJECT_REFS) {
    userAllowed.delete(prodRef);
  }

  if (userAllowed.has(project)) {
    return { type: 'remote_qa', project, verified: true };
  }

  // 3. Verified Remote QA
  if (VERIFIED_REMOTE_QA_PROJECTS.has(project)) {
    return { type: 'remote_qa', project, verified: true };
  }

  // 4. Verified Local Instance
  if (VERIFIED_LOCAL_INSTANCES.has(project)) {
    return { type: 'local_instance', project, verified: true };
  }

  // 5. Verified Mock (strict exact allowlist; fuzzy 'mock' labels in remote hostnames are never certified)
  if (VERIFIED_MOCKS.has(project)) {
    return { type: 'mock', project, verified: true };
  }

  // Reject remote hosts containing 'mock' in hostname that are not verified local/mock fixtures
  if (project.includes('mock')) {
    return {
      type: 'unverified',
      project,
      verified: false,
      reason: `Target '${project}' contains 'mock' label but is not an allowlisted mock fixture. Arbitrary remote hosts with mock in name are rejected.`,
    };
  }

  // 6. Bare localhost or 127.0.0.1 without verified instance port
  if (project === 'localhost' || project === '127.0.0.1') {
    return {
      type: 'unverified',
      project,
      verified: false,
      reason: `Bare '${project}' hostname without verified local instance port is rejected. Localhost alone is not proof of database isolation.`,
    };
  }

  // Reject common or unverified local ports (e.g. port 5432)
  if (project.startsWith('localhost:') || project.startsWith('127.0.0.1:')) {
    return {
      type: 'unverified',
      project,
      verified: false,
      reason: `Target '${project}' is not an explicitly verified isolated emulator instance (expected port 54321). Port 5432 is a common uninspected Postgres port and is rejected.`,
    };
  }

  // 7. Staging-like labels without explicit verification
  if (project.includes('staging')) {
    return {
      type: 'unverified',
      project,
      verified: false,
      reason: `Target '${project}' has a staging-like label but is not in the verified QA allowlist. Staging labels alone are not proof of isolation.`,
    };
  }

  return {
    type: 'unverified',
    project,
    verified: false,
    reason: `Target '${project}' is unknown and not in the verified isolated QA allowlist.`,
  };
}

function assertIsolatedQaDatabase(databaseUrl, options = {}) {
  const destinationType = options.destinationType || 'database';
  const url = databaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      `CRITICAL PREFLIGHT GUARD: Mutation test refused! No target ${destinationType} URL provided or found in environment.`
    );
  }

  const classification = classifyTarget(url, { customAllowlist: options.customAllowlist });

  if (classification.type === 'production') {
    throw new Error(
      `CRITICAL PREFLIGHT GUARD: Mutation test refused! Target ${destinationType} '${classification.project}' is a verified PRODUCTION database. Direct mutations, tests, and automated write flows are strictly prohibited.`
    );
  }

  if (!classification.verified) {
    throw new Error(
      `CRITICAL PREFLIGHT GUARD: Mutation test refused! Target ${destinationType} '${classification.project}' is NOT verified: ${classification.reason}`
    );
  }

  if (classification.type === 'mock' && options.allowLocalMock === false) {
    throw new Error(
      `CRITICAL PREFLIGHT GUARD: Mutation test refused! Live mutation required, but target ${destinationType} is a mock environment (${classification.project}).`
    );
  }

  return { allowed: true, project: classification.project, targetType: classification.type };
}

async function assertTargetApplicationIsolatedQa(targetAppBaseUrl = 'http://localhost:3000', options = {}) {
  const fetchImpl = options.fetchFn || globalThis.fetch;
  const healthUrl = `${targetAppBaseUrl.replace(/\/$/, '')}/api/database/health`;

  let res;
  try {
    res = await fetchImpl(healthUrl, { signal: AbortSignal.timeout(5000) });
  } catch (err) {
    throw new Error(
      `CRITICAL PREFLIGHT GUARD: Could not probe target application database configuration at ${healthUrl}: ${err.message}. Refusing mutation test.`
    );
  }

  if (!res.ok) {
    throw new Error(
      `CRITICAL PREFLIGHT GUARD: Target application health probe returned HTTP ${res.status} at ${healthUrl}. Refusing mutation test.`
    );
  }

  const data = await res.json().catch(() => null);
  const isLive = !!data?.health?.isLive || !!data?.isLive;
  const reportedDbProject = data?.databaseProject || (isLive ? 'unknown_live_database' : 'mock-sap-lms');
  const reportedStorageProject = data?.storageProject || reportedDbProject;
  const storageBackend = data?.storageBackend || (isLive ? 'supabase_storage' : 'local_disk_mock');

  // 1. Verify Database Destination
  const dbVerified = assertIsolatedQaDatabase(reportedDbProject, {
    customAllowlist: options.customAllowlist,
    allowLocalMock: !isLive,
    destinationType: 'database',
  });

  // 2. Verify Storage Destination
  const storageVerified = assertIsolatedQaDatabase(reportedStorageProject, {
    customAllowlist: options.customAllowlist,
    allowLocalMock: !isLive,
    destinationType: 'storage',
  });

  // 3. Enforce Configuration Consistency
  if (isLive) {
    if (dbVerified.project !== storageVerified.project) {
      throw new Error(
        `CRITICAL PREFLIGHT GUARD: Inconsistent target configuration! Target application database points to '${dbVerified.project}' but storage points to '${storageVerified.project}'. Both destinations must target the same verified isolated environment.`
      );
    }
    if (storageBackend !== 'supabase_storage') {
      throw new Error(
        `CRITICAL PREFLIGHT GUARD: Inconsistent target configuration! Target application is in live mode with database '${dbVerified.project}', but storage backend is '${storageBackend}'. Live mutations require consistent verified remote storage.`
      );
    }
  } else {
    if (dbVerified.targetType === 'remote_qa' || storageVerified.targetType === 'remote_qa') {
      throw new Error(
        `CRITICAL PREFLIGHT GUARD: Inconsistent target configuration! Target application reports non-live mode, but configured destination points to remote QA ('${dbVerified.project}'/'${storageVerified.project}').`
      );
    }
  }

  return {
    allowed: true,
    database: { project: dbVerified.project, targetType: dbVerified.targetType },
    storage: { project: storageVerified.project, backend: storageBackend },
    isLive,
  };
}

module.exports = {
  KNOWN_PRODUCTION_PROJECT_REFS,
  VERIFIED_REMOTE_QA_PROJECTS,
  VERIFIED_LOCAL_INSTANCES,
  VERIFIED_MOCKS,
  extractProjectIdentifier,
  isProductionDatabase,
  classifyTarget,
  assertIsolatedQaDatabase,
  assertTargetApplicationIsolatedQa,
};
