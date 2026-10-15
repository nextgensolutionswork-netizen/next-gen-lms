# Exhaustive Code Audit Report: Accounts & Financial Modules (9 Pages)

**Audit Target:** Next-Gen LMS Accounts & Finance Suite  
**Scope:** 9 Frontend Pages + Underlying Services (`fee-workflow-service.ts`, `finance-service.ts`, `data-store.ts`, `persistent-storage-adapter.ts`, `excel-export.ts`)  
**Auditor:** Research Subagent  
**Date:** October 9, 2026

---

## Executive Summary & Systemic Architectural Gaps

1. **Dual Data Model Split-Brain (Critical Inconsistency):**
   - The platform has two competing financial systems running simultaneously:
     - **Legacy Fee Store:** `store.feeAccounts`, `store.installments`, `store.payments` used by `fees/page.tsx`, `installments/page.tsx`, `reports/page.tsx`, and Tab 2 of `payments/page.tsx`.
     - **Centralized Workflow Store:** `store.studentFees`, `store.studentPayments`, `store.studentFinancialLedgerEntries` used by `approvals/page.tsx` and Tab 1 of `payments/page.tsx`.
   - **Impact:** Approving a fee in `accounts/approvals` or collecting/verifying a payment in `accounts/payments` does NOT update `store.feeAccounts`, `store.installments`, or `store.payments`. Consequently, `accounts/fees` and `accounts/reports` completely ignore newly collected centralized payments, showing stagnant or zero metrics.
2. **Client-Side State Persistence Gap:**
   - In `lib/services/persistent-storage-adapter.ts`, `isServer = typeof window === 'undefined'`. On the client browser, `isServer` is `false`, causing `loadState()` and `saveState()` to return `null`/`false`.
   - There is NO `localStorage` or IndexedDB fallback. When users record payments, approve expenses, create vendors, or approve fee proposals in the browser, all data resides in the ephemeral in-memory singleton and **vanishes completely upon page refresh (F5)**.
3. **Role Impersonation & RBAC Vulnerability:**
   - Both `payments/page.tsx` and `approvals/page.tsx` implement client-side `<select>` dropdowns that allow any browser user to switch identities to "Suresh Kumar (Accountant)" or "Rajesh Sharma (Super Admin)". This bypasses all separation-of-duties invariants.
4. **Mock and No-Op Event Handlers:**
   - Clickable spans styled as hyperlinks (`cursor-pointer hover:underline`) without `onClick` or `<Link>` (e.g. `payments/page.tsx` line 439).
   - "Edit & Resubmit" in `approvals/page.tsx` line 818 triggers a browser `alert()` and never opens an editing modal.

---

## Detailed Page-by-Page Audit Findings

---

### 1. `app/(dashboard)/accounts/fees/page.tsx` (Student Fee Accounts Ledger)

#### A. Crash Risks on Empty Data / Initial State
- **Line 24 & 29: Unprotected Spread of Undefined Store Property:**
  ```tsx
  24: const [feeAccounts, setFeeAccounts] = React.useState<StudentFeeAccount[]>(store.feeAccounts);
  ...
  29: let list = [...store.feeAccounts];
  ```
  If `store.feeAccounts` is uninitialized or empty in storage, `[...store.feeAccounts]` throws `TypeError: store.feeAccounts is not iterable`.
- **Line 48–49: `NaN` Propagation in KPI Reducers:**
  ```tsx
  48: const totalOutstanding = store.feeAccounts.reduce((sum, f) => sum + f.outstanding_amount, 0);
  49: const totalCollected = store.feeAccounts.reduce((sum, f) => sum + f.paid_amount, 0);
  ```
  If any record has `outstanding_amount` or `paid_amount` as `undefined` or `null`, `sum + undefined` evaluates to `NaN`. The cards render `₹NaN`.
- **Line 171–195: Missing Table Empty State UI:**
  If `feeAccounts.length === 0`, the `<tbody>` renders completely empty without any "No fee accounts found" feedback.

#### B. Broken, Mock, or Incomplete Event Handlers
- **Line 82–87 & 187–192: Loss of Student Context on Navigation:**
  ```tsx
  82: <Link href="/accounts/payments">
  83:   <Button variant="sap" size="sm" className="text-xs flex items-center space-x-1">
  84:     <Plus className="h-4 w-4" />
  85:     <span>Record Payment</span>
  86:   </Button>
  87: </Link>
  ...
  187: <Link href="/accounts/payments">
  188:   <Button variant="sap" size="sm" className="text-xs px-2.5 py-1">
  189:     Collect
  190:   </Button>
  191: </Link>
  ```
  Both the header "Record Payment" and table row "Collect" buttons link to `/accounts/payments` without passing `student_id` or `fee_account_id` as query parameters. The payment page opens with unrelated defaults.

#### C. Broken Links, Modal Triggers, or Route Redirects
- No modal or route exists to adjust, discount, or create new student fee ledger accounts directly from this page.

#### D. RBAC Gaps
- Zero role checks. Any user (student, counsellor, visitor) can view full institutional discounts, net payables, and outstanding balances, and export the entire financial ledger.

#### E. Workflow Gaps vs. SOP
- Disconnected from `feeWorkflowService`. Fee proposals approved in `accounts/approvals` do not appear here because this page reads `store.feeAccounts`, not `store.studentFees`.
- GST components (CGST, SGST, IGST) are not displayed; only lump-sum net payables are visible.

#### F. State Synchronization
- Local state initialized from `store.feeAccounts`. Changes are ephemeral in memory and wiped on browser reload.

---

### 2. `app/(dashboard)/accounts/installments/page.tsx` (Installment Schedules & Overdue Radar)

#### A. Crash Risks on Empty Data / Initial State
- **Line 22 & 27: Unchecked Store Array:**
  ```tsx
  22: const [installments, setInstallments] = React.useState<Installment[]>(store.installments);
  ```
  If `store.installments` is `undefined`, `installments.filter(...)` throws an uncaught exception.
- **Line 107–146: Missing Empty State:**
  If filtered installments are empty, the table renders a blank body with no message.

#### B. Broken, Mock, or Incomplete Event Handlers
- **Line 45–49 & 136–141: Context-Free Payment Redirect:**
  ```tsx
  136: <Link href="/accounts/payments">
  137:   <Button variant="sap" size="sm" className="text-xs px-2.5 py-1">
  138:     Pay
  139:   </Button>
  140: </Link>
  ```
  Clicking "Pay" on installment #2 for ₹25,000 links to `/accounts/payments` without passing `installment_id` or student context.
- **Missing Overdue Action Handlers:**
  Despite the banner declaring *"Immediate follow-up required by accounts and counseling desk"* (Line 59), there are no action buttons for reminder emails, SMS, WhatsApp alerts, or automated delinquency flagging.
- **Missing Export Utilities:**
  Unlike all other accounts pages, `installments/page.tsx` has no CSV or Excel export handler.

#### C. Broken Links & Routing Gaps
- Filter button (Line 62–69) sets filter to `'Due'`, but overdue records can have status `'Overdue'`. Consequently, true overdue items may be excluded if they aren't tagged `'Due'`.

#### D. RBAC Gaps
- No authorization checks. Delinquent installment radars are exposed without role fencing.

#### E. Workflow Gaps vs. SOP
- In the centralized fee workflow (`feeWorkflowService`), fees can have payment plans (2 Installments, 3 Installments), but no actual installment rows are generated in `store.installments`.
- No installment recalculation logic: partial payments do not dynamically redistribute remaining balances across upcoming milestone dates.

#### F. State Synchronization
- Reads purely from `store.installments`; changes are never persisted to disk or localStorage.

---

### 3. `app/(dashboard)/accounts/payments/page.tsx` (Fee Payments & Verification Desk)

#### A. Crash Risks on Empty Data / Initial State
- **Line 50–52: Fallback User Crash if `store.users` Has Fewer Than 3 Users:**
  ```tsx
  50: const [currentUser, setCurrentUser] = React.useState<UserProfile>(
  51:   store.users.find((u) => u.id === 'usr-accounts') || store.users[2]
  52: );
  ```
  If `usr-accounts` does not exist and `store.users` has <3 users, `currentUser` is `undefined`. Accessing `currentUser.id` or `currentUser.role` crashes the page.
- **Line 62–65: Empty Dropdown When No Approved Fees Exist:**
  ```tsx
  62: const approvedFees = (store.studentFees || []).filter(
  63:   (f) => f.approval_status === 'Approved' && f.outstanding_amount > 0
  64: );
  65: const [selectedFeeId, setSelectedFeeId] = React.useState(approvedFees[0]?.id || '');
  ```
  When `approvedFees.length === 0`, `selectedFeeId` is `''`, rendering an empty `<select>` without helpful guidance.
- **Line 96: Unsafe `toLowerCase()` on Potentially Undefined Receipt Number:**
  ```tsx
  96: p.receipt_number.toLowerCase().includes(q)
  ```
  If `p.receipt_number` is missing, search crashes with `Cannot read properties of undefined (reading 'toLowerCase')`.
- **Line 144 & 312: Fallback Routing to Non-Existent Receipt ID `'verified'`:**
  ```tsx
  144: setSuccessReceiptId(paymentRec.receipt_number || 'verified');
  ...
  312: <Link href={`/accounts/receipts/${successReceiptId}`}>
  ```
  If `successReceiptId` is `'verified'`, clicking "View Generated Receipt" routes to `/accounts/receipts/verified`, which falls back to rendering `store.receipts[0]` (the wrong student's receipt).

#### B. Broken, Mock, or Incomplete Event Handlers
- **Line 438–442: Dead Clickable Receipt Link:**
  ```tsx
  438: <td className="px-4 py-3 text-right font-mono text-blue-600 font-semibold">
  439:   {p.receipt_number ? (
  440:     <span className="hover:underline cursor-pointer">{p.receipt_number}</span>
  441:   ) : (
  442:     <span className="text-slate-400 font-normal italic">Pending</span>
  443:   )}
  444: </td>
  ```
  The receipt number is styled with `hover:underline cursor-pointer` but has **no `onClick` or `<Link>`**. Clicking it does nothing!
- **Line 34: Dead Unused Import:**
  `recordPaymentAtomic` is imported from `finance-service` but never used.
- **Disconnection Between Centralized and Historical Tabs:**
  Submitting via `feeWorkflowService.recordPayment` only updates `studentPayments`. Tab 2 ("Historical Transactions") reads `payments`, so newly recorded and verified payments never appear in the historical tab.

#### C. Broken Links & Routing Gaps
- **Line 552: Faulty Fallback in Historical Table:**
  ```tsx
  552: <Link href={`/accounts/receipts/${receipt?.id || p.id}`}>
  ```
  If `receipt` is not found, it links with `p.id` (`pay-...`). The receipt view page checks `r.id === id || r.receipt_number === id` (not `r.payment_id`), failing the match and rendering `store.receipts[0]`.

#### D. RBAC Gaps
- **Line 220–234: Unrestricted Role Impersonation Switcher:**
  ```tsx
  222: <select
  223:   value={currentUser.id}
  224:   onChange={(e) => {
  225:     const u = store.users.find((user) => user.id === e.target.value);
  226:     if (u) setCurrentUser(u);
  227:   }}
  ```
  Any user can switch their role to Super Admin or Accountant to approve their own payments or verify transactions client-side.

#### E. Workflow Gaps vs. SOP
- Verification modal requires manual accountant confirmation, but there is no integration with banking webhooks or gateway APIs (Razorpay / Cashfree UTR reconciliation).
- Partial payments do not link to installment schedules.

#### F. State Synchronization
- `feeWorkflowService.recordPayment` calls `store.persist()`, but `persistentStorage.saveState()` is a no-op on the client. All payments and verifications vanish on reload.

---

### 4. `app/(dashboard)/accounts/receipts/page.tsx` (Signed Official Receipts)

#### A. Crash Risks on Empty Data / Initial State
- **Line 22–24: Unsafe `toLowerCase()` Without Optional Chaining (Crash Risk):**
  ```tsx
  22: r.receipt_number.toLowerCase().includes(q) ||
  23: r.student_name.toLowerCase().includes(q) ||
  24: r.admission_number.toLowerCase().includes(q)
  ```
  Unlike other pages, `r.receipt_number`, `r.student_name`, and `r.admission_number` lack optional chaining (`?.`). If any receipt has an undefined field, search immediately crashes the page.
- **Line 85–120: Missing Table Empty State:**
  No fallback row when `receipts.length === 0`.

#### B. Broken, Mock, or Incomplete Event Handlers
- Download PDF (`/api/receipts/${r.id}/pdf?download=true`) depends on server-side nodejs execution, but if accessed offline or in mock browser mode, it fails without UI error handling.

#### C. Broken Links, Modal Triggers, or Route Redirects
- Table view button correctly links to `/accounts/receipts/${r.id}`.

#### D. RBAC Gaps
- No role fencing: all financial receipts, admission numbers, payment methods, and student identities can be viewed and exported by anyone.

#### E. Workflow Gaps vs. SOP
- Missing Void / Cancel Receipt workflow (e.g., bounced cheque or transaction chargeback). Receipts cannot be cancelled or amended with credit notes.
- No direct WhatsApp or Email share trigger from the registry table.

#### F. State Synchronization
- In-memory state only (`store.receipts`).

---

### 5. `app/(dashboard)/accounts/receipts/[id]/page.tsx` (Official Receipt View & Print)

#### A. Crash Risks on Empty Data / Initial State
- **Line 24–26: CRITICAL CRASH When `store.receipts` is Empty:**
  ```tsx
  24: const receipt = store.receipts.find((r) => r.id === id || r.receipt_number === id) || store.receipts[0];
  ...
  26: const gstInfo = receipt.taxable_amount !== undefined && receipt.supply_type
  ```
  If `store.receipts` is empty `[]`, `receipt` is `undefined`. Line 26 throws:
  `TypeError: Cannot read properties of undefined (reading 'taxable_amount')`.
  There is NO `if (!receipt)` guard.
- **Line 24: Silent Data Leak / Wrong Receipt Displayed:**
  If an invalid or unrecognized `id` is passed, `receipt` defaults to `store.receipts[0]`. The user is shown another student's confidential fee receipt instead of a 404 page!

#### B. Broken, Mock, or Incomplete Event Handlers
- **Line 54–57: `handlePrint` Does NOT Print:**
  ```tsx
  54: const handlePrint = () => {
  55:   window.open(pdfUrl, '_blank');
  56: };
  ```
  "Print View" calls `window.open(pdfUrl, '_blank')` instead of `window.print()`. Popups are frequently blocked by browsers, and the print dialog is never opened.
- **Line 284–287: Hardcoded Signatory Name:**
  ```tsx
  284: <div className="h-16 border-b border-dashed border-slate-400 flex items-end justify-center pb-1">
  285:   <span className="font-serif italic font-bold text-slate-800 text-sm">Suresh Kumar</span>
  286: </div>
  287: <p className="font-bold text-slate-800 mt-1">{receipt.authorized_by}</p>
  ```
  "Suresh Kumar" is hardcoded in the signature font, even if `receipt.authorized_by` is another officer.
- **Line 41–42: Hardcoded Mock IRN & Ack Hash Fallbacks:**
  ```tsx
  41: irn: receipt.irn || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  42: ack_no: receipt.ack_no || '1226102948191',
  ```
  Hardcoded mock SHA-256 string for GST e-Invoice IRN.

#### C. Broken Links & Routing Gaps
- Does not match receipts by `payment_id`. Routing from payments via `p.id` causes fallback to `store.receipts[0]`.

#### D. RBAC Gaps
- Publicly accessible page without authentication or student authorization tokens.

#### E. Workflow Gaps vs. SOP
- No automated email dispatch option to student/parent from the receipt view page.

#### F. State Synchronization
- Reads from ephemeral `store.receipts`.

---

### 6. `app/(dashboard)/accounts/expenses/page.tsx` (Institute Expense & Vendor Outflows)

#### A. Crash Risks on Empty Data / Initial State
- **Line 33: Unchecked Vendor ID When `store.vendors` is Empty:**
  ```tsx
  33: const [vendorId, setVendorId] = React.useState(store.vendors[0]?.id || '');
  ```
  If `store.vendors` is empty, `vendorId` is `''`, rendering an empty vendor `<select>`.
- **Line 50: Crash Risk on Search When `expense_code` is Missing:**
  ```tsx
  50: e.expense_code.toLowerCase().includes(q)
  ```
  Lacks optional chaining (`?.`). If `expense_code` is missing on any item, search crashes.
- **Line 95–97: `NaN` Risk on Total Settled Calculation:**
  If `e.amount` is invalid, `totalPaidExpenses` becomes `NaN`.

#### B. Broken, Mock, or Incomplete Event Handlers
- **Line 77: Hardcoded Submitter ID:**
  ```tsx
  77: 'usr-accounts'
  ```
  The creating user is hardcoded to `'usr-accounts'`.
- **Line 87: Hardcoded Superadmin Bypass in `handleApprove`:**
  ```tsx
  86: const handleApprove = async (id: string) => {
  87:   await approveExpense(id, 'usr-superadmin');
  88:   refreshList();
  89: };
  ```
  **CRITICAL RBAC BYPASS:** Any user who clicks "Approve" automatically executes `approveExpense` as `'usr-superadmin'`!
- **Line 322–330: Direct "Paid" Status Selection Bypasses Approvals Entirely:**
  ```tsx
  325: <select value={status} onChange={(e) => setStatus(e.target.value as any)}>
  326:   <option value="Paid">Paid (Already Settled)</option>
  327:   <option value="Approved">Approved</option>
  328:   <option value="Pending Approval">Pending Approval</option>
  329:   <option value="Draft">Draft</option>
  330: </select>
  ```
  Anyone creating an expense can select "Paid (Already Settled)", completely evading management approval!
- **Line 198–210: Approved Expenses Cannot Be Paid:**
  When an expense is approved, its status becomes `'Approved'`, NOT `'Paid'`. There is NO "Mark as Paid" or "Disburse" button. Because the KPI card (Line 96) only filters `e.status === 'Paid'`, approved expenses never count towards settled expenses!

#### C. Broken Links & Routing Gaps
- No modal or route to inspect invoice attachments or payment proof.

#### D. RBAC Gaps
- No role validation: any user can create expenses, approve expenses as superadmin, and view vendor payouts.

#### E. Workflow Gaps vs. SOP
- Multi-tier approvals are absent: no distinction between petty cash (<₹5,000) vs. major capital expenditures (>₹50,000).
- No expense rejection or return-for-review action.
- GST Input Tax Credit (ITC) tracking is missing: no breakdown of vendor CGST/SGST/IGST for GSTR-2B filing.

#### F. State Synchronization
- Ephemeral in-memory state; reverts on reload.

---

### 7. `app/(dashboard)/accounts/vendors/page.tsx` (Vendor Management & GST Records)

#### A. Crash Risks on Empty Data / Initial State
- **Line 46–48: Unsafe String Search:**
  ```tsx
  46: v.vendor_name.toLowerCase().includes(q) ||
  47: v.contact_person.toLowerCase().includes(q) ||
  48: v.gst_number?.toLowerCase().includes(q)
  ```
  If `v.vendor_name` or `v.contact_person` is null/undefined, search throws an error.
- **Line 113: Missing Empty State:**
  No empty placeholder if `vendors.length === 0`.

#### B. Broken, Mock, or Incomplete Event Handlers
- **Missing Edit Vendor Handler:**
  There is NO "Edit Vendor" button or modal. Once a vendor is created, bank account numbers, IFSC codes, phone numbers, and GSTINs cannot be updated.
- **Missing Vendor Deactivation Handler:**
  Vendors cannot be archived, disabled, or deleted.
- **Line 130–136: Non-Interactive Phone and Email:**
  Phone and email fields are static plain text without `tel:` or `mailto:` links.
- **Line 11: Unused Import:**
  `ExternalLink` is imported from `lucide-react` but never rendered.

#### C. Broken Links & Routing Gaps
- No navigation link to view all expenses associated with a vendor (e.g. `/accounts/expenses?vendor_id=...`).

#### D. RBAC Gaps
- Complete vendor banking details (account numbers, IFSC, lifetime payments) are visible and editable by all roles.

#### E. Workflow Gaps vs. SOP
- No GSTIN structure validation (15-character state code + PAN + check digit algorithm).
- No PAN capture or TDS (Tax Deducted at Source) category configuration (Section 194C/194J/194I).

#### F. State Synchronization
- Ephemeral memory only; new vendors disappear on page reload.

---

### 8. `app/(dashboard)/accounts/approvals/page.tsx` (Global LMS Fee Approvals Desk)

#### A. Crash Risks on Empty Data / Initial State
- **Line 687: Crash on Undefined Tax Amount:**
  ```tsx
  687: (incl. ₹{fee.tax_gst_amount.toLocaleString('en-IN')} GST)
  ```
  If `fee.tax_gst_amount` is undefined, `undefined.toLocaleString()` throws `TypeError`.
- **Line 707: Unsafe String Split:**
  ```tsx
  707: {fee.submitted_at?.split('T')[0] || fee.created_at.split('T')[0]}
  ```
  If `fee.created_at` is undefined or not a string, `split('T')` throws an error.

#### B. Broken, Mock, or Incomplete Event Handlers
- **Line 807–826: CRITICAL MOCK ACTION ("Edit & Resubmit"):**
  ```tsx
  807: {fee.approval_status === 'Correction Required' && isOwnSubmission && (
  808:   <Button
  809:     variant="outline"
  810:     size="sm"
  811:     onClick={() => {
  812:       setSelectedFee(fee);
  813:       setProposedFeeAmount(fee.proposed_fee);
  814:       setProposedDiscount(fee.discount_amount);
  815:       setProposedDiscountPercent(fee.discount_percentage);
  816:       setProposedDiscountReason(fee.discount_reason || '');
  817:       // Open resubmit prompt
  818:       alert(
  819:         `Accountant Note: "${fee.correction_reason}"\n\nPlease adjust the proposal parameters and resubmit.`
  820:       );
  821:     }}
  822:   >
  823:     Edit & Resubmit
  824:   </Button>
  825: )}
  ```
  **Clicking "Edit & Resubmit" only triggers a browser `alert()`!** It never opens the edit modal or proposal dialog. The user is told to adjust parameters, but no form is displayed!
- **Line 376–395: Client-Side Role Spoofing Dropdown:**
  Allows users to toggle identities freely to approve their own fee proposals.

#### C. Broken Links, Modal Triggers, or Route Redirects
- "Edit & Resubmit" modal trigger is completely missing (only shows `alert()`).

#### D. RBAC Gaps
- Checks rely solely on the simulated `currentUser` client state. No backend session verification.

#### E. Workflow Gaps vs. SOP
- Multi-level discount approval is ignored: `fee-workflow-service.ts` flags discounts exceeding thresholds for "Management" approval, but this UI permits any Accountant to approve 100% discounts in one click.
- Approval does not create installment records in `store.installments` or update `store.feeAccounts`.

#### F. State Synchronization
- In-memory only; approvals and proposals reset on page reload.

---

### 9. `app/(dashboard)/accounts/reports/page.tsx` (Financial Intelligence & Analytics)

#### A. Crash Risks on Empty Data / Initial State
- **Line 208 & 231: Unchecked `Object.entries` on Dashboard Metrics:**
  ```tsx
  208: Object.entries(metrics.courseRevenueMap as Record<string, number>).map(...)
  ...
  231: Object.entries(metrics.paymentModeMap as Record<string, number>).map(...)
  ```
  If `metrics.courseRevenueMap` or `metrics.paymentModeMap` is `undefined`, `Object.entries(undefined)` throws `TypeError: Cannot convert undefined or null to object`.

#### B. Broken, Mock, or Incomplete Event Handlers
- **Line 8, 10–11: Dead Icon Imports (Missing Charts & Date Filtering):**
  `Calendar`, `PieChart`, `BarChart`, and `Layers` are imported but never used.
- **Missing Date Range Filtering:**
  There are NO date range pickers, monthly selectors, or financial year toggles, despite cards claiming to show "Monthly Collections" and "Monthly Expenses".
- **Line 209 & 232: CRITICAL MATHEMATICAL BUG (Invalid Percentage Calculation):**
  ```tsx
  209: const pct = metrics.monthlyCollections > 0 ? Math.round((rev / metrics.monthlyCollections) * 100) : 0;
  ...
  232: const pct = metrics.monthlyCollections > 0 ? Math.round((amt / metrics.monthlyCollections) * 100) : 0;
  ```
  `rev` is **LIFETIME** course revenue from all payments, while `metrics.monthlyCollections` is **THIS MONTH's** revenue!
  `(rev / metrics.monthlyCollections) * 100` can compute to **300% to 1000%**, causing progress bar overflow and absurd percentages! Conversely, if monthly collections is ₹0, all course percentages display as 0% despite massive lifetime revenues.

#### C. Broken Links & Routing Gaps
- Progress bars and category summaries lack drill-down links to filtered payment reports.

#### D. RBAC Gaps
- High-level institutional turnover, net cash surplus, and GSTR-1 audit exports are accessible without role fencing.

#### E. Workflow Gaps vs. SOP
- **Exclusion of Centralized Payments Desk:**
  Reports and GSTR-1 exports read exclusively from `store.payments`. All payments collected and verified via `store.studentPayments` (the centralized desk) are completely omitted from turnover, tax liability, and export sheets!

#### F. State Synchronization
- Metrics calculated once on mount; does not react to store mutations without full reload.

---

## Consolidated Action Plan & Remediation Matrix

| Page | Priority | Primary Bug / Gap | Required Fix |
|---|---|---|---|
| `fees/page.tsx` | High | Disconnected from `studentFees` & lacks student routing | Unify with centralized fee store; pass query params to payments desk |
| `installments/page.tsx` | High | "Pay" button drops context; no reminder actions | Pass `installment_id` & `student_id` to payment modal; add SMS/Email triggers |
| `payments/page.tsx` | Critical | Dead receipt link (line 439); client role spoofing; split-brain with historical tab | Implement receipt modal/link; remove client role switcher; sync `studentPayments` to `payments` |
| `receipts/page.tsx` | High | Unsafe `toLowerCase()` crash; lacks void/cancel workflow | Add optional chaining on all fields; implement receipt cancellation |
| `receipts/[id]/page.tsx` | Critical | Crash when store empty; wrong receipt fallback on invalid ID; fake print button | Add 404 guard; match by `payment_id`; fix `handlePrint` to invoke `window.print()` |
| `expenses/page.tsx` | Critical | 1-click superadmin bypass; "Paid" status bypasses approval; approved expenses never paid | Restrict approval to authenticated manager; remove direct "Paid" option; add "Pay Expense" flow |
| `vendors/page.tsx` | Medium | No edit/archive handler; lacks PAN/TDS fields | Add Edit Vendor modal; add Section 194C/J TDS fields |
| `approvals/page.tsx` | Critical | "Edit & Resubmit" is mock `alert()`; lacks multi-level discount thresholds | Open Edit Proposal modal on click; enforce Director signoff for >20% discounts |
| `reports/page.tsx` | High | Lifetime vs. monthly percentage bug; ignores `studentPayments` in GSTR-1 | Fix math to divide by total revenue; aggregate both `payments` and `studentPayments` |
| **Global Storage** | Critical | Client mutations not persisted on refresh | Add localStorage / Supabase synchronization adapter for browser environment |
