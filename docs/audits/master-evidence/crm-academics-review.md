# CRM, academics, student portal, support and certificate source review

Date: 2026-10-17. Scope: current local source, read-only analysis. No browser, remote database, external notification, or production mutation was executed. These are source-confirmed behavior paths, not claims of successful live exploitation.

## Inventory and dependencies

| Area | Routes | Principal dependencies and data |
|---|---|---|
| CRM | /crm/leads, /crm/followups | crm-service; leads, lead_followups, profiles; direct browser service calls and local store |
| Admissions | /admissions, /api/admissions | admission-service, fee-workflow-service, payment-session; admissions, students, batches, fee workflow state |
| Academics | /academics/courses, /academics/batches, /academics/schedule, /academics/attendance, /academics/assignments, /academics/assessments, /academics/sap-servers | academics-service and sap-lab-service; courses/modules/lessons/progress, batches/transfers, sessions/attendance, assignments/submissions, quizzes/questions/attempts |
| Student | /portal, /students, /students/[id] | auth context, student-service, data-store, quiz runner, payment workflow, support and placement services |
| Support | /support and portal doubt panels | doubt-service; student_doubts, doubt_messages, notification and realtime services |
| Certificates | /certificates, /certificate/verify/[id], /api/certificates/[id]/pdf | certificate-service, pdf-service, store.certificates, notification-service |

Role intent includes counsellor/admin CRM management, trainer academic operations, support ticket operations, student self-service, and admin certificate issuance. UI role restrictions are not proof of server authorization. The inspected generic service functions frequently accept actor IDs and use the shared client store; independent authenticated role tests are still required.

## Confirmed source findings

### CA-01 â€” High: unmatched student resolves to first student

`app/portal/page.tsx:120-132` first matches email/id/user_id, then uses `store.students[0]` unconditionally at line129 even for a student role. Fee details, submissions, certificates and SAP allocation derive from that chosen student. Reproduction precondition: a signed-in student without a matching record and a nonempty hydrated store. The source selects another record instead of showing a missing-profile error. Actual remote exposure depends on what data is hydrated; not live verified. Fix: exact authenticated user and tenant mapping, fail closed when absent, server ownership checks on subsequent operations.

### CA-02 â€” High: quizzes are graded in the browser and repeated passes inflate progress

`app/portal/page.tsx:2414` passes full `store.quizQuestions` to the quiz runner. `components/portal/quiz-runner-modal.tsx:116-127` evaluates answers and records the attempt directly in the browser. `lib/services/academics-service.ts:1566-1572` reads `options.is_correct`; answer keys therefore exist on the client. `academics-service.ts:1665-1669` adds15 points to course progress on every passing recorded attempt, without unique quiz completion protection. `1684-1696` does not enforce attempt limits or server timing. This permits repeat-pass progress inflation in the local model and client-controlled scoring; cross-session persistence and remote acceptance were not tested. Fix: server scoring, redact answer keys, ownership/attempt/time validation and progress derived from unique completed learning units.

### CA-03 â€” High: CRM/support/academic writes can report local success after database failure

`lib/services/crm-service.ts:103-138` persists new leads before a database insert, does not inspect its returned error, and returns the record at138. Stage updates follow the same pattern at163-197. `doubt-service.ts:186-226` persists ticket and first message locally before separate database writes and does not check returned errors. `academics-service.ts:72-94` does the same for course creation. In addition, `lib/supabase/db.ts` live-query error branch falls through into local RLS/store evaluation. Thus the app can appear to succeed while the authoritative database rejected or never received the write. `persistent-storage-adapter.ts:225-226` stores browser snapshots in localStorage. Fix: authoritative server mutations with explicit error handling and transactions; any offline queue must expose pending/failed sync state and have idempotent reconciliation.

### CA-04 â€” Medium: student academic items are scoped by course instead of batch

`app/portal/page.tsx:152-153` selects assignments by course_id only, and161-162 selects sessions by course_id only. If two batches share a course, each student's portal can list the other batch's assignments and sessions, including session meeting links rendered from these records. Scope to enrolled batches plus explicitly course-wide items. Verify with two synthetic same-course batches; no live cross-batch request was performed.

### CA-05 â€” High: certificate issuance uses invented academic metrics and insufficient course binding

`lib/services/certificate-service.ts:29-45` checks student aggregate attendance, course_progress and outstanding balance, but does not establish enrollment/completion of the requested course. At77-78 it hardcodes assignment completion90 and exam score88. A student and arbitrary existing course are sufficient for the course lookup; academic eligibility is not derived from that enrollment's submissions/attempts. This can generate inaccurate certificate facts in the current service path. Fix: server-authoritative per-enrollment eligibility, actual assessment aggregation, issuer authorization and persisted uniqueness.

### CA-06 â€” High: revoked certificate PDF remains generatable

`app/api/certificates/[id]/pdf/route.ts:21-37` searches certificates by internal id, certificate code or student id and generates a PDF without checking `is_valid` or revocation status. It requires no session in the handler; `middleware.ts:204-205` passes API routes through. Response at52-57 also publicly caches the document. Public certificate verification may be intentional, but continuing to produce an official PDF after revocation is a separate integrity defect. Fix: deny revoked/fraudulent issuance, use appropriate nonpublic or revocation-aware caching and decide explicitly what public verification may disclose.

### CA-07 â€” Medium: batch transfer updates local counts without equivalent remote count update

`lib/services/academics-service.ts:599-609` decrements/increments batch occupancy in the local store; remote branch614-626 writes transfer audit and student batch but not either batch count. These writes are separate and their result errors are not checked. Unless an independently installed database trigger maintains counts, browser and database occupancy can diverge and concurrent capacity checks are not protected. No such trigger was validated live. Fix: transactional transfer RPC locking target capacity and atomically recording student, occupancy and audit.

## Scope limits and positive controls

The transfer service checks target capacity/status, mandatory reason and trainer ownership before mutation (`academics-service.ts:540-581`). Schedule creation checks time ordering and overlapping trainer/classroom/batch slots; attendance and assignment APIs contain local validation. These controls are useful but do not establish cross-process transactions or authoritative authorization.

Tenant migration `20261012094737_payment_approval_workflow.sql:7-11` adds restrictive policies to a specific fee/admissions/onboarding table list. That list does not include CRM/academic/support tables. This observation is a review gap, not proof all other tables lack effective isolation: all effective migration policies and deployed database state must be independently enumerated. No claim of complete RLS validation is made here.

Some helper code (for example convertLeadToAdmission) marks a lead enrolled before admission, but the current CRM UI navigates directly to admissions at `app/(dashboard)/crm/leads/page.tsx:731`; the unused helper is not counted as a confirmed UI conversion defect.

Next tests: two-tenant/two-batch role fixtures; denied and disconnected database writes; repeated quiz completion; revoked certificate request; student with absent identity mapping; concurrent capacity transfers. All must use isolated staging.

