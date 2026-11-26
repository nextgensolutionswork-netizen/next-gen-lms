# 14 — Security Audit Report

## Unauthenticated Probes (Production)
- `/api/database/health` → HTTP 200
- `/api/bulk-import/template` → HTTP 200
- `/api/users` → HTTP 401
- `/api/crm/leads` → HTTP 401
- `/api/students` → HTTP 401
- `/api/admissions` → HTTP 401
- `/api/fees/payments` → HTTP 401
- `/api/fees/receipts` → HTTP 401
- `/api/fees/reconcile` → HTTP 401
- `/api/audit-logs` → HTTP 401
- `/api/settings` → HTTP 200
- `/api/settings/bank-accounts` → HTTP 401
- `/api/counsellors` → HTTP 401
- `/api/dashboard/metrics` → HTTP 401

## Confirmed Security Findings
- **BUG-001 (P0):** Hardcoded fallback `AUTH_COOKIE_SECRET` in `lib/security/auth-cookie.ts` and browser-side signing in `app/login/page.tsx`.
- **BUG-002 (P0):** `GET /api/fees/receipts` leaked all tenant students to Sales (`counsellor`).
- **BUG-003 (P1):** `GET /api/database/health` and `GET /api/settings` were unauthenticated (200 OK).
- **BUG-004 (P1):** `middleware.ts` lacked route guards for `/academics/*`, `/support`, and `/audit`.
