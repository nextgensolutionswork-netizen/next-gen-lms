# 17 — Root Cause Analysis

1. **BUG-002:** `app/api/fees/receipts/route.ts` filtered `store.students` only by `tenantId` and `student`, omitting `counsellor_id`.
2. **BUG-003:** `app/api/database/health/route.ts` and `app/api/settings/route.ts` lacked `authenticateApiRequest` / `getAuthenticatedUserFromRequest` checks.
3. **BUG-004:** `middleware.ts` enforced boundaries for `/accounts`, `/crm`, `/admissions`, `/placement`, `/onboarding`, `/settings`, `/audit-logs`, `/users`, but omitted `/academics`, `/support`, and `/audit`.
4. **BUG-005:** `ROLE_PERMISSIONS.admin` in `lib/auth/rbac.ts` omitted `vendors:read` and `vendors:write` while `sidebar.tsx` exposed `/accounts/vendors` to Admin.
