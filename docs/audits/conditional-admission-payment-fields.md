# Conditional admission payment fields

Verified 2026-10-31.

Cash hides and clears admission reference/proof fields and stores a null reference. Noncash requires a reference; proof is optional for all seven modes. Actual payment date defaults to the Asia/Kolkata calendar date and remains editable. Collecting a payment requires a positive amount.

Both Accounts approval entry points require manual amount/date verification; noncash additionally requires reference verification. The server compares the specific payment record before financial mutations and records entered values in the existing approval audit. Existing authorization, transaction, receipt and duplicate protections remain in place.

## Validation

- Full Vitest suite: 738 passed, 0 failed; report success=true.
- TypeScript: passed (tsc --noEmit --incremental false).
- ESLint: passed without warnings or errors.
- Coverage includes seven payment modes, mode transitions, cash without reference/proof, optional noncash proof, missing references, manual approval mismatches, reference normalization, authorization, duplicate protection and transaction rollback.
- Vite emitted its existing CJS API deprecation warning.

## Limits

Tests used isolated local storage. No production data modifications or deployment. Browser interaction testing and a production build were not performed. Existing noncash records missing their original reference cannot be approved until corrected through the authorized workflow.
