import http from 'http';
import crypto from 'crypto';
import os from 'os';

const BASE_URL = 'http://localhost:3000';
const AUTH_COOKIE_SECRET = 'next-gen-lms-secure-auth-secret-2026';

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 200,
  maxFreeSockets: 50,
  timeout: 15000,
});

function createAuthSessionCookies(user) {
  const cookieVal = encodeURIComponent(JSON.stringify(user));
  const sig = crypto.createHmac('sha256', AUTH_COOKIE_SECRET).update(cookieVal).digest('hex');
  return `next_gen_auth_user=${cookieVal}; next_gen_auth_user_sig=${sig}`;
}

function generateVirtualUsers(count) {
  const roles = ['student', 'trainer', 'counsellor', 'accountant', 'onboarding_team', 'admin'];
  const users = [];
  for (let i = 1; i <= count; i++) {
    const role = roles[(i - 1) % roles.length];
    const user = {
      id: `vu-${role}-${String(i).padStart(3, '0')}`,
      email: `perf.${role}.${i}@example.com`,
      full_name: `Virtual User ${i} (${role})`,
      role,
      is_active: true,
      tenant_id: 'default',
    };
    user.cookieHeader = createAuthSessionCookies(user);
    users.push(user);
  }
  return users;
}

function executeRequest(path, cookieHeader) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method: 'GET',
        agent: httpAgent,
        headers: {
          Cookie: cookieHeader,
          Origin: BASE_URL,
          Accept: 'application/json, text/html, */*',
        },
      },
      (res) => {
        let bytes = 0;
        res.on('data', (chunk) => {
          bytes += chunk.length;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            durationMs: Date.now() - start,
            bytes,
            error: null,
          });
        });
      }
    );

    req.on('error', (err) => {
      resolve({
        statusCode: 0,
        durationMs: Date.now() - start,
        bytes: 0,
        error: err.message,
      });
    });

    req.setTimeout(10000, () => {
      req.destroy();
      resolve({
        statusCode: 408,
        durationMs: Date.now() - start,
        bytes: 0,
        error: 'Socket timeout',
      });
    });

    req.end();
  });
}

function calculatePercentiles(latencies) {
  if (latencies.length === 0) return { min: 0, avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const p = (pct) => sorted[Math.min(Math.floor((pct / 100) * sorted.length), sorted.length - 1)];
  return {
    min: sorted[0],
    avg: sum / sorted.length,
    p50: p(50),
    p95: p(95),
    p99: p(99),
    max: sorted[sorted.length - 1],
  };
}

async function runTier(tierUsers, durationSec = 15) {
  console.log(`\n--- BENCHMARKING TIER: ${tierUsers.length} CONCURRENT USERS (${durationSec}s SUSTAINED) ---`);
  const initialMem = process.memoryUsage();
  const startTime = Date.now();
  const endTime = startTime + durationSec * 1000;
  const metrics = [];

  const targetsByRole = {
    student: ['/portal', '/accounts/receipts', '/api/storage/signed-url?bucket=assignments&path=lessons%2Fintro.mp4'],
    trainer: ['/academics/batches', '/academics/courses', '/academics/attendance'],
    counsellor: ['/crm/leads', '/crm/followups', '/api/fees/payments'],
    accountant: ['/accounts/fees', '/accounts/approvals', '/api/fees/payments'],
    onboarding_team: ['/onboarding', '/api/onboarding/analytics'],
    admin: ['/dashboard', '/users', '/audit-logs', '/api/database/health'],
  };

  const vuPromises = tierUsers.map(async (vu) => {
    const roleTargets = targetsByRole[vu.role] || ['/dashboard'];
    while (Date.now() < endTime) {
      const path = roleTargets[Math.floor(Math.random() * roleTargets.length)];
      const res = await executeRequest(path, vu.cookieHeader);
      metrics.push({
        vuId: vu.id,
        role: vu.role,
        path: path.split('?')[0],
        statusCode: res.statusCode,
        durationMs: res.durationMs,
        bytes: res.bytes,
        error: res.error,
      });
      // Think time between 50ms and 150ms
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
    }
  });

  await Promise.all(vuPromises);
  const totalDuration = (Date.now() - startTime) / 1000;
  const finalMem = process.memoryUsage();

  const totalRequests = metrics.length;
  const errorRequests = metrics.filter((m) => m.statusCode >= 400 || m.statusCode === 0).length;
  const errorRate = (errorRequests / totalRequests) * 100;
  const rps = totalRequests / totalDuration;
  const latencies = metrics.map((m) => m.durationMs);
  const stats = calculatePercentiles(latencies);
  const totalMB = metrics.reduce((a, b) => a + b.bytes, 0) / (1024 * 1024);

  return {
    tier: `${tierUsers.length} Users`,
    durationSec: totalDuration.toFixed(1),
    totalRequests,
    rps: rps.toFixed(2),
    errorRequests,
    errorRate: `${errorRate.toFixed(2)}%`,
    avgLatencyMs: stats.avg.toFixed(1),
    p50LatencyMs: stats.p50.toFixed(1),
    p95LatencyMs: stats.p95.toFixed(1),
    p99LatencyMs: stats.p99.toFixed(1),
    maxLatencyMs: stats.max.toFixed(1),
    dataTransferredMB: totalMB.toFixed(2),
    heapUsedMB: (finalMem.heapUsed / (1024 * 1024)).toFixed(1),
    rssMB: (finalMem.rss / (1024 * 1024)).toFixed(1),
  };
}

export async function runMultiTierConcurrencyTest() {
  console.log('='.repeat(80));
  console.log(' PHASE 7: MULTI-TIER CONCURRENCY BENCHMARK SUITE');
  console.log(` Target Tiers: 10, 25, 50, 100 Virtual Users`);
  console.log(` Host: ${os.hostname()} (${os.cpus().length} CPUs, ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB RAM)`);
  console.log('='.repeat(80));

  const tiers = [10, 25, 50, 100];
  const summary = [];

  for (const count of tiers) {
    const vus = generateVirtualUsers(count);
    const result = await runTier(vus, 15);
    summary.push(result);
    // Cool down for 3 seconds between tiers
    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log('\n' + '='.repeat(80));
  console.log(' MULTI-TIER CONCURRENCY COMPARISON MATRIX:');
  console.table(summary);
  console.log('='.repeat(80));

  return summary;
}

if (process.argv[1]?.endsWith('04-multi-tier-concurrency.mjs')) {
  runMultiTierConcurrencyTest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Multi-tier benchmark failed:', err);
      process.exit(1);
    });
}
