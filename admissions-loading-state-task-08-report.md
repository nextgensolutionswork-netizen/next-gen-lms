# TASK-08 — Admissions Loading State, Skeleton UI & Authoritative Empty State Report

**Branch:** `task-08-admissions-loading` (merged & pushed to `origin/main`)  
**Production URL:** https://next-gen-lms-omega.vercel.app  

---

## 1. Executive Summary & Exact Root Cause
Previously, `app/(dashboard)/admissions/page.tsx` suffered from four compounding loading/empty-state defects:
1. **Error-to-Empty Misrepresentation:** On any fetch failure (`catch (error)`), `setAdmissions([])` wiped records while `setIsLoading(false)` ran, causing `admissions.length === 0` to render **"No Admissions Found"** directly below the error alert.
2. **Auth Hydration Ignorance & Fabricated `0` Count:** `useAuth().isLoading` was not checked, and the header badge rendered `{admissions.length} Registered Records` (`0 Registered Records`) during initial loading.
3. **Background Refresh Flicker & Missing Stale-Response Guard:** Every search/filter/sync refresh called `setIsLoading(true)` and replaced the entire table with skeletons, with no `requestGenerationRef` or session-key check to discard out-of-order responses or pre-logout data.
4. **Conflated Empty States:** Confirmed empty and filtered empty states shared `"No Admissions Found"` with no `Clear Filters` action.

## 2. Files Modified & Created
- `lib/services/admissions-loading-state.ts` (New): Explicit `AdmissionsViewState` state machine (`initial_loading | session_expired | unauthorized | error | refreshing | loaded | confirmed_empty | filtered_empty`), `classifyAdmissionsError`, and `filterAdmissions`.
- `app/(dashboard)/admissions/page.tsx`: Wired `isAuthLoading`, `requestGenerationRef`, `isMountedRef`, `sessionKeyRef`, `allAdmissions` + memoized `filteredAdmissions`, header count skeleton, non-blocking `Refreshing...` indicator, stale refresh warning banner, recoverable `"Unable to load admissions"` + `Retry`, `"No matching admissions"` + `Clear Filters`, `"No admissions yet"` (creation CTA gated by `canCreateAdmission`), and `"Session Expired"` UI.
- `lib/services/payment-workflow-client.ts`: Attached HTTP `status` on thrown errors and safe JSON parsing (`res.json().catch(() => ({}))`).
- `components/ui/skeleton.tsx`: Added `motion-reduce:animate-none` for reduced-motion accessibility.
- `tests/task-08-admissions-loading-state.test.tsx` (New): 6 targeted unit/contract tests.

## 3. Browser & Accessibility Verification
Verified via headless Edge/Chromium Playwright harness across all 7 viewports (`360×640`, `390×844`, `768×1024`, `1024×768`, `1280×720`, `1440×900`, `1920×1080`):
- Initial loading skeleton: `aria-busy="true"`, `hasSkeleton: true`, `hasEmptyFlash: false` (`task08-admissions-skeleton-1280x720.png`).
- Out-of-order response guard: slow `ADM-STALE` (400ms) discarded when fast 4-row response (50ms) completed first (`task08-admissions-loaded-1280x720.png`).
- Background refresh: preserves 4 rows with `Refreshing...` pill (`task08-admissions-refresh-1280x720.png`).
- Filtered empty + Clear Filters: displays `"No matching admissions"` and restores 4 rows (`task08-admissions-filtered-empty-1280x720.png`).
- New Admission modal over loaded table: preserves 4 rows (`task08-admissions-modal-1280x720.png`).
- Confirmed empty (`task08-admissions-empty-1280x720.png`) and Error + Retry (`task08-admissions-error-1280x720.png`): error never renders `"No admissions yet"`, and Retry restores 4 rows.
- Authenticated live `/admissions` browser verification: `BLOCKED — AUTH_REQUIRED` (retained for TASK-11).
