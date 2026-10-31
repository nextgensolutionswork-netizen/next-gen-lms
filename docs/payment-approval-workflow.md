# Student payment approval

Manual payment entries now remain `Pending Approval` until a different authorized Accounts user approves them. The existing `verification_status` values (`Pending Verification`, `Verified`, `Rejected`) remain compatible with financial reports; `status` exposes the requested approval terminology.

The admission form and payment desks submit through authenticated server APIs. Initial admission payments do not credit balances, issue receipts, activate student accounts, or trigger onboarding. Accounts approval credits the exact enrollment balance, generates one receipt, records the reviewer and timestamp, and saves immutable before/after audit events. Rejected payments retain the reason and can be corrected and resubmitted by the submitter. The approved payment history is immutable.

Confirmed admissions with an approved partial or full payment enter onboarding. Assignment selects an active onboarding specialist in the same tenant, retaining any existing assignment. In-app notifications appear in the header and desks refresh every 15 seconds. If no specialist is available, administrators receive the assignment notification. LMS activation requires admission, identity/contact, document, course, batch and fee checks; orientation and first-class confirmation remain subsequent onboarding steps.

## Deployment

1. Apply `supabase/migrations/20261012094737_payment_approval_workflow.sql` after the existing migrations. It adds tenant boundaries, the transactional workflow state, access gates and private payment-proof storage. Applied to the configured project `tgohtdzwehhjfahtgovq` on 2026-10-13, along with the missing onboarding migration. Its onboarding prerequisite was recorded as `20261012094736_onboarding_team_and_cases` using the contents of `006_onboarding_team_and_cases.sql` (updated to use `gen_random_uuid()`). The project already had legacy tables without recorded migration history, so only these two migrations were staged and pushed. Do not replay the legacy schema/seed migrations; reconcile their history against the existing schema before a future full-directory push.
2. Configure real Supabase Auth and a server-only `SUPABASE_SERVICE_ROLE_KEY`. Production payment APIs reject demonstration cookies and never accept user IDs or roles as bearer tokens. Development retains signed local sessions for the existing demonstration login.
3. Existing rows are assigned to tenant `default`. For a multi-institute installation, assign profiles and related records to the correct tenant before enabling users. Tenant membership and roles are authoritative profile fields, not editable user metadata.
4. The first tenant request imports its existing native admission, fee-account and payment records. Thereafter `fee_workflow_state` is authoritative for the existing in-memory dual-ledger modules. It commits fees, payments, receipts, audits, in-app notifications and onboarding together with a revision check. Financial writes must use the new APIs; do not push old client snapshots or run the legacy database push/pull job over these records. Concurrent stale writers receive a conflict and must refresh.
5. New proof uploads use private `payment-proofs` storage and an authenticated download endpoint. Historical externally hosted/public evidence URLs are retained; move legacy public evidence to private storage separately if required. Local development stores proof bytes under `data/payment-proofs`; protect and back up this directory with the local data snapshot. Production uses Supabase Storage and PostgreSQL without falling back to local files on failure.

The compatibility snapshot follows the repository's existing document-style data store. Native reporting integrations that bypass LMS service APIs must be updated to read the workflow state; it is not an automatic relational projection to every legacy table. Tenant snapshots serialize financial writes per institute, which prioritizes consistency over high-volume write throughput.

## Validation

`npx tsc --noEmit` and `npx vitest run` cover application behavior. Additional PostgreSQL execution checks are in `tests/payment-workflow-database.cjs`: install `@electric-sql/pglite` in a temporary directory, set `PGLITE_MODULE` to that installed module, then run `node tests/payment-workflow-database.cjs`. This tests the actual migration, RLS, revision conflicts, rollback, profile protection and the LMS gate without touching a live database.

## Fee balances and receipts

GST and scheduled installments are retired. New admissions, proposals, corrections, and revisions calculate the payable amount from the fee minus discounts plus any explicit additional charges. Partial payments are allowed against one outstanding balance, with the balance rechecked when Accounts approves each payment. New receipts contain payment details and the remaining balance, with no GST or generated e-invoice identifiers.

The installments navigation and reports are removed; old `/accounts/installments` links redirect to `/accounts/fees`. Historical approved balances, payment records, and schedule rows remain stored for compatibility and are not rewritten or deleted. Deprecated database tax fields are zero/empty on new receipts; legacy payment-plan fields use the existing `Full Payment` value but do not require paying the full balance at once.
# Manual payment verification

The Verify & Clear Student Payment modal requires Accounts to type the reference,
amount received, and actual payment date before explicitly confirming approval.
The inputs start blank each time the modal opens. Admission downpayments are
stored by `createAdmissionWorkflow` as individual `studentPayments` records with
their fee, student, and admission association; those records are the comparison
source, not the student's total fees or balance.

The approval API accepts `verification: { reference, amount, payment_date }`.
Amount is a decimal string with at most two fractional digits; comparison uses
integer minor units without rounding. Reference comparison ignores whitespace
and case. Date comparison uses the stored calendar day without timezone conversion.
Non-cash payments missing their stored reference, and payments missing their actual
date, must be returned for correction before approval.

Cash uses its stored transaction/cash reference (or bank reference) when present.
Otherwise Accounts must explicitly type `CASH:<payment ID>` to acknowledge that
specific cash collection. This is a verification reference, not an official receipt;
the normal sequential receipt is generated only after successful approval.

All three checks run inside the existing authenticated approval transaction before
financial mutations. Mismatches return `fieldErrors` and commit no changes.
The `PAYMENT_APPROVED` audit snapshot includes `manual_verification` with the exact
entered strings, plus the existing verifier and timestamp. Existing receipt/ledger
duplicate guards, transaction serialization, and database revision checks remain in
force. No migration or historical-record rewrite is required.
