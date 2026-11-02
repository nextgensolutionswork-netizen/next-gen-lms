# Admission Fee Due Date Validation & Institute Business Rules Investigation

**Date:** 2026-11-02  
**Target Application:** Next Gen LMS (ERP Hub)  
**Production Component:** `/admissions` (Register New Student Admission modal) & Admission Workflow Service  
**Status:** Completed & Verified  

---

## 1. Executive Summary & Observed Issue

### Observed Behavior
In the **Register New Student Admission** modal on `/admissions`, when an admissions counsellor enrolled a student and collected the full net payable fee upfront (e.g. ₹45,000 paid immediately via UPI/Card/Bank Transfer), the form blocked submission if the **Fee Due Date** field was empty. The browser displayed a native HTML5 validation constraint error: *"Please fill out this field"*, forcing counsellors to select an arbitrary future date even though no outstanding balance remained.

### Root Cause
1. **Unconditional `required` HTML Attribute:**  
   In [`app/(dashboard)/admissions/page.tsx`](file:///e:/my%20erp%20hub/next%20gen%20lms/app/(dashboard)/admissions/page.tsx), `<Input label="Fee Due Date *" type="date" value={feeDueDate} required />` was rendered statically as `required`, regardless of whether `collectInitialPayment` was selected or whether `initialPaymentAmount >= netPayable`.
2. **Missing Business Rule Differentiation:**  
   The UI and service layer did not distinguish between:
   - **Full Payment Upfront (`isFullPayment`):** Outstanding balance is ₹0. Fee Due Date is non-actionable and therefore **optional**.
   - **Partial Payment or Pay Later (`!isFullPayment`):** An outstanding tuition balance remains. A future Fee Due Date is **strictly required** for Accounts reconciliation and automated payment reminder scheduling.
3. **Absence of Clear Field-Level Validation Messages:**  
   When partial payment or Pay Later was chosen, leaving the date blank did not trigger an informative field-level explanation of *why* the date was required or what criteria it had to satisfy (e.g., must not be prior to admission date).

---

## 2. Institute Business Rules for Fee Due Dates

Based on institutional accounting and financial compliance standards:
1. **Full Tuition Payment Collected Upfront:**
   - When `collectInitialPayment === true` and `initialPaymentAmount >= netPayable` (or when `netPayable === 0` under a 100% scholarship):
     - The entire tuition obligation is discharged upon enrollment.
     - **Fee Due Date is OPTIONAL.**
     - Form label: `Fee Due Date (Optional)`.
     - Browser `required` constraint is deactivated (`required={false}`).
     - If the counsellor leaves the field blank, `createAdmissionWorkflow` defaults `first_due_date` to `payment_date || admission_date`.
     - If the counsellor chooses to specify an optional due date, it must still be a valid calendar date on or after the admission date.
2. **Partial Payment or Pay Later:**
   - When `!collectInitialPayment` (Pay Later) OR `collectInitialPayment === true` but `initialPaymentAmount < netPayable`:
     - An unpaid balance remains: $\text{Remaining Arrears} = \text{Net Payable} - \text{Initial Paid} > 0$.
     - **Fee Due Date is STRICTLY REQUIRED.**
     - Form label: `Fee Due Date *`.
     - Browser `required` constraint is activated (`required={true}`).
     - If submitted empty or invalid, the field renders an explicit red error message:
       - *"Fee due date is required for partial payment or pay later."*
       - *"Fee due date cannot be before the admission date."*
       - *"Please enter a valid fee due date."*

---

## 3. Technical Changes Implemented

### A. Core Validation Function (`lib/services/admission-service.ts`)
Created and exported [`validateFeeDueDate`](file:///e:/my%20erp%20hub/next%20gen%20lms/lib/services/admission-service.ts#L82):
```typescript
export interface FeeDueDateValidationResult {
  isValid: boolean;
  isRequired: boolean;
  error?: string;
}

export function validateFeeDueDate(params: {
  feeDueDate?: string;
  admissionDate: string;
  netPayable: number;
  collectInitialPayment?: boolean;
  initialPaymentAmount?: number;
}): FeeDueDateValidationResult {
  const initialAmount = params.collectInitialPayment ? (params.initialPaymentAmount || 0) : 0;
  const isFullPayment = initialAmount >= params.netPayable || params.netPayable === 0;
  const rawDueDate = params.feeDueDate?.trim();

  if (isFullPayment) {
    if (!rawDueDate) return { isValid: true, isRequired: false };
  } else {
    if (!rawDueDate) {
      return {
        isValid: false,
        isRequired: true,
        error: 'Fee due date is required for partial payment or pay later.',
      };
    }
  }

  const parsedDueDate = new Date(`${rawDueDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDueDate) || !Number.isFinite(parsedDueDate.getTime()) || parsedDueDate.toISOString().slice(0, 10) !== rawDueDate) {
    return {
      isValid: false,
      isRequired: !isFullPayment,
      error: 'Please enter a valid fee due date.',
    };
  }

  if (rawDueDate < params.admissionDate) {
    return {
      isValid: false,
      isRequired: !isFullPayment,
      error: 'Fee due date cannot be before the admission date.',
    };
  }

  return { isValid: true, isRequired: !isFullPayment };
}
```

In [`createAdmissionWorkflow`](file:///e:/my%20erp%20hub/next%20gen%20lms/lib/services/admission-service.ts#L268):
- If `rawDueDate` is provided: validates calendar format and ensures `rawDueDate >= input.admission_date`.
- If `rawDueDate` is omitted/empty: safely defaults `feeDueDate` to `input.payment_date || input.admission_date`.

### B. Admissions Form UI (`app/(dashboard)/admissions/page.tsx`)
1. **Dynamic State & Helpers:**
   - Added `const [feeDueDateError, setFeeDueDateError] = React.useState('');`.
   - Computed `const isFullPayment = (collectInitialPayment && initialPaymentAmount >= netPayable) || netPayable === 0;`.
   - Computed `const isFeeDueDateRequired = !isFullPayment;`.
   - Automatically cleared `feeDueDateError` when switching to full payment.
2. **Field-Level Validation & Submission Interceptor:**
   - In `handleCreateAdmission`: invokes `validateFeeDueDate(...)`.
   - If invalid: sets `feeDueDateError` with the specific reason and blocks submission.
   - If valid: clears errors and passes `fee_due_date: feeDueDate.trim() ? feeDueDate : undefined`.
3. **Form Element Enhancements:**
   - Uses `label={isFeeDueDateRequired ? "Fee Due Date *" : "Fee Due Date (Optional)"}`.
   - Dynamic `required={isFeeDueDateRequired}`.
   - Dynamic `error={feeDueDateError}` which renders red border and message text via `components/ui/input.tsx`.
   - Helper subtext:
     - Full payment: *"Full payment collected upfront; fee due date is optional."*
     - Partial payment / Pay Later: *"Required for remaining balance of ₹X."*

---

## 4. Verification & Automated Test Evidence

### Test Suite: `tests/admission-fee-due-date.test.ts`
11 comprehensive test cases covering all business rules:
1. `Full payment collected upfront: fee due date is optional when omitted` -> **PASSED**
2. `Full payment collected upfront with an optional valid due date: accepts and preserves due date` -> **PASSED**
3. `Partial payment collected: fee due date is required and succeeds when valid` -> **PASSED**
4. `Partial payment with missing due date: validation fails with clear field error` -> **PASSED**
5. `Pay Later (uncollected upfront) with valid due date: succeeds` -> **PASSED**
6. `Pay Later with missing due date: validation fails with clear error` -> **PASSED**
7. `Pay Later preset (collectInitialPayment === true but amount === 0): requires due date` -> **PASSED**
8. `Due date before admission date: validation fails and service rejects` -> **PASSED**
9. `Malformed date string: validation fails and service rejects` -> **PASSED**
10. `Discount and net payable calculations remain correct with optional due date` -> **PASSED**
11. `CRM lead conversion with full payment upfront and omitted due date updates lead correctly` -> **PASSED**

### Integration Suite Passes:
- `tests/crm-conversion-button.test.ts`: **8 passed (8)**
- `tests/dual-ledger-sync.test.ts`: **4 passed (4)**
- `tests/crm-admissions-operations.test.ts`: **17 passed (17)**

### Tooling Checks:
- `npm run typecheck`: **Clean pass (0 errors)**
- `npm run lint`: **Clean pass (0 warnings, 0 errors)**

---

## 5. Security, Calculations & Data Integrity
- **Preserved Existing Data:** All standard student admission attributes, batch assignment, training mode, counsellor attribution, and payment proofs remain unaltered.
- **Financial Accruals:** Net payable formula `Math.max(0, course_fee - discount)` and counsellor discount ceilings (15%) are preserved.
- **Idempotency Protection:** Double-click protection `isSubmitting` on the form and backend idempotency keys (`idempotency_key` and `lead_id`) prevent duplicate admissions or duplicate payment records.
- **Zero Production Mutations:** All testing executed locally using mock stores without touching production databases or modifying RLS policies.
