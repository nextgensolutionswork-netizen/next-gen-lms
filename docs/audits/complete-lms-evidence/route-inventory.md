# Route inventory

| Route | Kind | Source | Methods | Coverage |
|---|---|---|---|---|
| `/` | Page | `app/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/academics/assessments` | Page | `app/(dashboard)/academics/assessments/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/academics/assignments` | Page | `app/(dashboard)/academics/assignments/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/academics/attendance` | Page | `app/(dashboard)/academics/attendance/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/academics/batches` | Page | `app/(dashboard)/academics/batches/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/academics/courses` | Page | `app/(dashboard)/academics/courses/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/academics/sap-servers` | Page | `app/(dashboard)/academics/sap-servers/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/academics/schedule` | Page | `app/(dashboard)/academics/schedule/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/accounts/approvals` | Page | `app/(dashboard)/accounts/approvals/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/accounts/expenses` | Page | `app/(dashboard)/accounts/expenses/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/accounts/fees` | Page | `app/(dashboard)/accounts/fees/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/accounts/installments` | Page | `app/(dashboard)/accounts/installments/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/accounts/payments` | Page | `app/(dashboard)/accounts/payments/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/accounts/receipts` | Page | `app/(dashboard)/accounts/receipts/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/accounts/receipts/[id]` | Page | `app/(dashboard)/accounts/receipts/[id]/page.tsx` |  | NOT TESTED |
| `/accounts/reports` | Page | `app/(dashboard)/accounts/reports/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/accounts/vendors` | Page | `app/(dashboard)/accounts/vendors/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/admissions` | Page | `app/(dashboard)/admissions/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/api/admissions` | API | `app/api/admissions/route.ts` | GET, POST | NOT TESTED |
| `/api/attendance/sync-meeting` | API | `app/api/attendance/sync-meeting/route.ts` | POST, GET | NOT TESTED |
| `/api/audit-logs` | API | `app/api/audit-logs/route.ts` | GET | NOT TESTED |
| `/api/bulk-import/execute` | API | `app/api/bulk-import/execute/route.ts` | POST | NOT TESTED |
| `/api/bulk-import/preview` | API | `app/api/bulk-import/preview/route.ts` | POST | NOT TESTED |
| `/api/bulk-import/template` | API | `app/api/bulk-import/template/route.ts` | GET | NOT TESTED |
| `/api/certificates/[id]/pdf` | API | `app/api/certificates/[id]/pdf/route.ts` | GET | NOT TESTED |
| `/api/conference/create-meeting` | API | `app/api/conference/create-meeting/route.ts` | POST | NOT TESTED |
| `/api/database/backup` | API | `app/api/database/backup/route.ts` | GET, POST | NOT TESTED |
| `/api/database/health` | API | `app/api/database/health/route.ts` | GET | NOT TESTED |
| `/api/database/sync` | API | `app/api/database/sync/route.ts` | POST | NOT TESTED |
| `/api/fees/payments` | API | `app/api/fees/payments/route.ts` | GET, POST | Unauthenticated GET 401; authenticated mutations BLOCKED |
| `/api/fees/proof` | API | `app/api/fees/proof/route.ts` | POST, GET | NOT TESTED |
| `/api/fees/proposals` | API | `app/api/fees/proposals/route.ts` | POST | NOT TESTED |
| `/api/fees/receipts` | API | `app/api/fees/receipts/route.ts` | GET | NOT TESTED |
| `/api/onboarding` | API | `app/api/onboarding/route.ts` |  | NOT TESTED |
| `/api/onboarding/[id]` | API | `app/api/onboarding/[id]/route.ts` |  | NOT TESTED |
| `/api/onboarding/analytics` | API | `app/api/onboarding/analytics/route.ts` | GET | NOT TESTED |
| `/api/onboarding/backfill` | API | `app/api/onboarding/backfill/route.ts` | POST | NOT TESTED |
| `/api/onboarding/cases` | API | `app/api/onboarding/cases/route.ts` | GET, POST | NOT TESTED |
| `/api/onboarding/cases/[id]` | API | `app/api/onboarding/cases/[id]/route.ts` | GET, PATCH | NOT TESTED |
| `/api/payments/create-order` | API | `app/api/payments/create-order/route.ts` | POST | NOT TESTED |
| `/api/payments/verify` | API | `app/api/payments/verify/route.ts` | POST | NOT TESTED |
| `/api/realtime/broadcast` | API | `app/api/realtime/broadcast/route.ts` | POST | NOT TESTED |
| `/api/realtime/stream` | API | `app/api/realtime/stream/route.ts` | GET | NOT TESTED |
| `/api/receipts/[id]/pdf` | API | `app/api/receipts/[id]/pdf/route.ts` | GET | NOT TESTED |
| `/api/settings` | API | `app/api/settings/route.ts` | GET, POST | NOT TESTED |
| `/api/storage/signed` | API | `app/api/storage/signed/route.ts` | GET | NOT TESTED |
| `/api/storage/signed-url` | API | `app/api/storage/signed-url/route.ts` | POST | NOT TESTED |
| `/api/upload` | API | `app/api/upload/route.ts` | POST | NOT TESTED |
| `/api/webhooks/google-meet` | API | `app/api/webhooks/google-meet/route.ts` | POST | NOT TESTED |
| `/api/webhooks/razorpay` | API | `app/api/webhooks/razorpay/route.ts` | POST | NOT TESTED |
| `/api/webhooks/zoom` | API | `app/api/webhooks/zoom/route.ts` | POST | NOT TESTED |
| `/api/workflow/notifications` | API | `app/api/workflow/notifications/route.ts` |  | NOT TESTED |
| `/audit-logs` | Page | `app/(dashboard)/audit-logs/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/certificate/verify/[id]` | Page | `app/certificate/verify/[id]/page.tsx` |  | NOT TESTED |
| `/certificates` | Page | `app/(dashboard)/certificates/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/crm/followups` | Page | `app/(dashboard)/crm/followups/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/crm/leads` | Page | `app/(dashboard)/crm/leads/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/dashboard` | Page | `app/(dashboard)/dashboard/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/login` | Page | `app/login/page.tsx` |  | Public page/forms/responsive; real authentication BLOCKED |
| `/onboarding` | Page | `app/(dashboard)/onboarding/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/placement` | Page | `app/(dashboard)/placement/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/placement/enrollments` | Page | `app/(dashboard)/placement/enrollments/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/portal` | Page | `app/portal/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/settings` | Page | `app/(dashboard)/settings/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/students` | Page | `app/(dashboard)/students/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/students/[id]` | Page | `app/(dashboard)/students/[id]/page.tsx` |  | NOT TESTED |
| `/support` | Page | `app/(dashboard)/support/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/todos` | Page | `app/todos/page.tsx` |  | Unauthenticated redirect only: PASS |
| `/users` | Page | `app/(dashboard)/users/page.tsx` |  | Unauthenticated redirect only: PASS |
