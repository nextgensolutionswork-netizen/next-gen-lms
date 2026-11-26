# P0 Payment Approval Conflict — Final QA & Regression Report

## 1. PAY-APR-001 through PAY-APR-030 Verification Matrix

| ID | Scenario | Env / Evidence | Status |
| :--- | :--- | :--- | :--- |
| PAY-APR-001 | Normal ₹9,000 payment verification | `tests/p0-payment-approval-conflict.test.ts` + `e2e-accountant-fee-approval.test.ts` | PASS |
| PAY-APR-002 | Internal payment ID resolution | `tests/p0-payment-approval-conflict.test.ts` + `route.ts` | PASS |
| PAY-APR-003 | External `spr-*` payment ID resolution | `tests/p0-payment-approval-conflict.test.ts` | PASS |
| PAY-APR-004 | Correct receiving bank account ID (`bank-acc-01`) | `tests/p0-payment-approval-conflict.test.ts` | PASS |
| PAY-APR-005 | Multiple institutional accounts under HDFC Bank | `tests/accountant-payment-verification-bank-details.test.ts` | PASS |
| PAY-APR-006 | Valid transaction reference (`12345`) | `tests/p0-payment-approval-conflict.test.ts` | PASS |
| PAY-APR-007 | Duplicate transaction reference (`23505`) | `tests/p0-payment-approval-conflict.test.ts` | PASS |
| PAY-APR-008 | Invalid / mismatched transaction reference | `tests/p0-payment-approval-conflict.test.ts` | PASS |
| PAY-APR-009 | Valid actual payment date (`2026-11-27`) | `tests/p0-payment-approval-conflict.test.ts` | PASS |
| PAY-APR-010 | Date-only & Asia/Kolkata handling | `tests/financial-transaction-consistency-task-03.test.ts` | PASS |
| PAY-APR-011 | Amount mismatch rejection (approved rule) | `tests/p0-payment-approval-conflict.test.ts` | PASS |
| PAY-APR-012 | Invalid / non-positive amount rejection | `tests/p0-payment-approval-conflict.test.ts` | PASS |
| PAY-APR-013 | Stale workflow revision (`40001`) | `tests/p0-payment-approval-conflict.test.ts` | PASS |
| PAY-APR-014 | Concurrent unrelated payment update | `payment-workflow-transaction.ts` (`40001` CAS) | PASS |
| PAY-APR-015 | Concurrent approval of same payment | `fee-workflow-service.ts` + `payment-workflow-transaction.ts` | PASS |
| PAY-APR-016 | Already verified payment rejection | `tests/p0-payment-approval-conflict.test.ts` | PASS |
| PAY-APR-017 | Rejected payment protection | `tests/pending-payments-reconciliation.test.ts` | PASS |
| PAY-APR-018 | Double-click prevention (`pending` map) | `tests/p0-payment-approval-conflict.test.ts` | PASS |
| PAY-APR-019 | Idempotent approval replay (`idempotency_key`) | `route.ts` + `payment-workflow-client.ts` | PASS |
| PAY-APR-020 | Conflicting idempotency payload (`409`) | `idempotency-service.ts` | PASS |
| PAY-APR-021 | Receipt uniqueness & `issued_by` UUID | `tests/p0-payment-approval-conflict.test.ts` | PASS |
| PAY-APR-022 | Receipt sequence consistency | `tests/financial-transaction-consistency-task-03.test.ts` | PASS |
| PAY-APR-023 | Student fee balance accuracy (₹19k paid / ₹11k due) | `tests/p0-payment-approval-conflict.test.ts` | PASS |
| PAY-APR-024 | Ledger posting & reconciliation accuracy | `tests/p0-payment-approval-conflict.test.ts` | PASS |
| PAY-APR-025 | Complete store rollback on `22P02` / `40001` | `tests/p0-payment-approval-conflict.test.ts` | PASS |
| PAY-APR-026 | Lost HTTP response replay via `idempotency_key` | `payment-workflow-client.ts` + `route.ts` | PASS |
| PAY-APR-027 | Normalized & snapshot parity | `20261127_fix_commit_fee_workflow_receipt_issued_by.sql` (QA DB) | PASS |
| PAY-APR-028 | Unauthorized role rejection (`403`) | `tests/pending-payments-reconciliation.test.ts` | PASS |
| PAY-APR-029 | Cross-tenant approval rejection | `route.ts` (`assertSameTenant`) | PASS |
| PAY-APR-030 | Approval Desk error classification | `tests/p0-payment-approval-conflict.test.ts` + `approvals/page.tsx` | PASS |

## 2. Outstanding Blockers & Migration Dependency
1. **Production Migration Required (`tgohtdzwehhjfahtgovq`):** `supabase/migrations/20261127_fix_commit_fee_workflow_receipt_issued_by.sql` must be approved and applied to production Supabase `tgohtdzwehhjfahtgovq` before Padmaja retries approving `spr-1795735527117-07vj`.
2. **Authenticated Accountant Browser E2E:** `BLOCKED — AUTH_REQUIRED` (retained for authenticated QA session).
3. **Pre-existing Main Branch Test TypeScript Errors:** `tests/database-persistence.test.ts(264,25)`, `tests/platform-admin-operations.test.ts(671,28)`, and `tests/setupAuth.ts(2,13)` had pre-existing `tsc --noEmit` errors on `origin/main` `de8a14a` (unrelated to this hotfix; `npm run build` succeeds 52/52).
