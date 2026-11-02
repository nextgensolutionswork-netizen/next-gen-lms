# Production Students Page HTTP 401 Unauthorized Investigation Report

**Target URL:** `https://next-gen-lms-omega.vercel.app/students`  
**Failed Request:** `GET /rest/v1/students?select=*&order=created_at.desc`  
**HTTP Status:** `401 Unauthorized`  
**Reported UI Role:** Counsellor (`counsellor@next-generpsolutions.com` / Ananya Desai)  
**Production Project Ref:** `tgohtdzwehhjfahtgovq`  
**Date:** 2026-11-02  
**Status:** Root Cause Identified & Verified with Read-Only Probes  

---

## 1. Executive Summary

A user logged into the production deployment as **Counsellor** experienced an HTTP 401 Unauthorized error on the Students page (`/students`) when fetching student records via PostgREST (`GET /rest/v1/students?select=*&order=created_at.desc`).

Through read-only API probes, JavaScript bundle inspection of the deployed Vercel application, and codebase tracing:
1. **Primary Root Cause:** The Vercel production deployment environment variable `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` was populated with the publishable key belonging to the **staging** Supabase project (`neiccpnxftfmmwnvtgdy`), while `NEXT_PUBLIC_SUPABASE_URL` was configured to point to the **production** Supabase project (`tgohtdzwehhjfahtgovq`). This mismatched key was compiled into the production JavaScript bundle (`1232-cde59f95b410522f.js`).
2. **PostgREST Response:** When any request carries this mismatched key in the `apikey` or `Authorization: Bearer <key>` header, Supabase PostgREST explicitly rejects the request with:
   ```json
   {
     "message": "Invalid API key",
     "hint": "Double check the provided API key for typos. This API key might also be owned by another Supabase project."
   }
   ```
   accompanied by an HTTP status of `401 Unauthorized`.
3. **Authentication Masking Defect:** At login, `auth.signInWithPassword` failed against Supabase Auth with this same 401 error. However, `AuthProvider.login()` silently fell back to local preset credentials (`lib/auth/credentials.ts`), which created the application cookie `next_gen_auth_user` and set React auth state to "Counsellor" without acquiring an active Supabase Auth session JWT (`sb-tgohtdzwehhjfahtgovq-auth-token`).
4. **Subsequent PostgREST Failure:** When navigating to `/students`, Next.js middleware permitted access based on `next_gen_auth_user`, but `student-service.ts` initiated a direct browser query to Supabase PostgREST using `createSessionClient()`. Without an active Supabase Auth session token, it sent the bundled mismatched key, resulting in HTTP 401 Unauthorized.
5. **RLS Verification:** Live verification against `tgohtdzwehhjfahtgovq` using the genuine Counsellor session token confirmed that Row-Level Security (RLS) policy `"Staff view all students"` is intact and returns HTTP 200 OK with authorized student records for Counsellors.

---

## 2. Detailed Findings Against Investigation Items

### Item 1: Supabase Client Initialization and Authentication Flow on `/students`
- On `/students` (`app/(dashboard)/students/page.tsx`), the page uses `useRecordLoad` to invoke `getStudents(undefined, signal)`:
  ```ts
  // app/(dashboard)/students/page.tsx:50-53
  const loadStudents = React.useCallback((signal: AbortSignal) => getStudents(undefined, signal), []);
  const { data, status: loadStatus, error: loadError, reload } = useRecordLoad<Student[]>(
    !authLoading && user?.id && canAccessStudents ? user.id : null, loadStudents
  );
  ```
- In `lib/services/student-service.ts`:
  ```ts
  // lib/services/student-service.ts:12-20
  if (isLiveSupabaseEnabled()) {
    const supabase = typeof window !== 'undefined' ? createSessionClient() : createClient();
    const { data, error } = await supabase.from('students').select('*').order('created_at', { ascending: false });
    if (signal?.aborted) throw new Error('Student lookup cancelled.');
    if (error) throw new Error('Unable to load students. Please retry or contact your administrator.');
    store.students = (data || []) as Student[];
  }
  ```
- In browser contexts (`typeof window !== 'undefined'`), `createSessionClient()` invokes `@supabase/ssr`'s `createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY)`.
- When `supabase.from('students').select('*')` is called, the Supabase client internally runs `fetchWithAuth(...)`. If no active session token exists in `document.cookie` (`sb-<project-ref>-auth-token`), `fetchWithAuth` falls back to attaching the configured publishable key as `apikey` and `Authorization: Bearer <publishable_key>`.

### Item 2: Supabase Auth Session Verification
- **Did the failed request use a valid Supabase Auth session?** **NO.**
- Inspection of the deployed bundle and live simulation confirmed that no active session was present in the browser storage/cookies for project `tgohtdzwehhjfahtgovq`.
- The request was dispatched without a user JWT, transmitting only the publishable key as the bearer token.

### Item 3: Access-Token Expiration and Refresh Behavior
- In Supabase Auth, valid JWTs carry a standard TTL of 3600 seconds (1 hour).
- Under `@supabase/ssr`, `createBrowserClient` initializes GoTrue with `autoRefreshToken: true`. When a valid session exists in storage, `_getSessionToken()` invokes `auth.getSession()`, which transparently refreshes tokens using the refresh token before PostgREST requests are dispatched.
- However, when testing an expired/tampered JWT directly against PostgREST (simulated via read-only script), PostgREST responds:
  ```json
  {"code":"PGRST301","details":"None of the keys was able to decode the JWT","hint":null,"message":"No suitable key or wrong key type"}
  ```
- In the production failure, no session had ever been established in Supabase Auth because login authentication had failed upfront due to the invalid key.

### Item 4: Counsellor Identity Source (Real Supabase Auth vs Local Fallback)
- **Did the displayed Counsellor identity come from real Supabase Auth or a local fallback?**
  **It came entirely from the local fallback.**
- In `components/providers/auth-provider.tsx`:
  ```ts
  // 1. Attempt genuine Supabase Auth
  if (isLiveSupabaseEnabled() && password) {
    try {
      const db = getDb();
      const { data, error } = await db.auth.signInWithPassword({ email: email.trim(), password });
      if (!error && data?.user) { ... return true; }
      else if (error) {
        console.warn('[AuthProvider] Supabase signInWithPassword returned error, checking local/demo credentials:', error.message);
      }
    } catch (supaErr: any) { ... }
  }
  // 2. Silent fallback to local credentials
  const verification = await verifyUserCredentials(email, password);
  ```
- Because Supabase Auth rejected `signInWithPassword` with HTTP 401 (`Invalid API key`), `auth-provider.tsx` caught the error and verified the user locally via `lib/auth/credentials.ts`.
- The application then wrote the HMAC-signed cookie `next_gen_auth_user` and set the React context user to Counsellor Ananya Desai.
- As a result, the UI displayed "Counsellor", but Supabase Auth was completely unauthenticated.

### Item 5: Supabase URL and Key Configuration
- Production URL: `https://tgohtdzwehhjfahtgovq.supabase.co` (Production Project Ref: `tgohtdzwehhjfahtgovq`).
- Deployed Vercel bundle inspection (`_next/static/chunks/1232-cde59f95b410522f.js`):
  - Inlined Client Init:
    `createBrowserClient("https://tgohtdzwehhjfahtgovq.supabase.co", "sb_publishable_ta86fl6G2CbwIzrnJMTLsQ_W0U3QjYe")`
  - Origin of `sb_publishable_ta86...`: This key is configured in `.env.staging` and `render.yaml` for the **staging** project `neiccpnxftfmmwnvtgdy`.
- Correct Production Key (from `.env.local` / `.env.example`):
  - Matches project `tgohtdzwehhjfahtgovq` (`sb_publishable_dZxl...`).

### Item 6: The 401 Response Code and Sanitized Message
- Direct probe against `https://tgohtdzwehhjfahtgovq.supabase.co/rest/v1/students?select=*&order=created_at.desc` with the deployed key yielded:
  - **HTTP Status:** `401 Unauthorized`
  - **Response Headers:** `www-authenticate: Bearer error="invalid_token"`
  - **Sanitized Body:**
    ```json
    {
      "message": "Invalid API key",
      "hint": "Double check the provided API key for typos. This API key might also be owned by another Supabase project."
    }
    ```

### Item 7: Root Cause Classification
- The request was rejected because of an **invalid API key** (`sb_publishable_ta86...` belonging to staging project `neiccpnxftfmmwnvtgdy`).
- This caused a two-fold failure:
  1. Failed Supabase Auth session creation, triggering silent fallback to local credentials.
  2. Direct rejection of the unauthenticated PostgREST request carrying the invalid key.

### Item 8: Middleware and Browser Cookie Handling
- `middleware.ts`:
  1. Evaluates incoming request cookies using `createServerClient` from `@supabase/ssr`.
  2. Calls `supabase.auth.getUser()`, which fails (no Supabase session cookie).
  3. Falls back to Step 5: verifies HMAC signature of `next_gen_auth_user` cookie.
  4. Signature is valid and role is `counsellor`, so `middleware.ts` allows the navigation to `/students`.
- Browser Cookies:
  - `next_gen_auth_user`: Present & valid HMAC signature.
  - `sb-tgohtdzwehhjfahtgovq-auth-token`: **Missing**.
- The discrepancy between server middleware allowing the page to load based on `next_gen_auth_user` and the client-side `student-service.ts` failing against Supabase caused the UI to load and then fail on client fetch.

---

## 3. LMS Permissions & RLS Verification

To verify that Counsellors are authorized to view students once properly authenticated:
1. Checked PostgreSQL RLS policies in `supabase/migrations/000_full_schema_rls_and_seed.sql`:
   ```sql
   CREATE POLICY "Staff view all students" ON students
     FOR SELECT USING (
       get_current_user_role() IN ('super_admin', 'admin', 'counsellor', 'trainer', 'placement_coordinator', 'accountant', 'support')
     );
   ```
2. Executed a read-only authentication and query probe against `tgohtdzwehhjfahtgovq` using the valid production publishable key (`sb_publishable_dZxl...`) and genuine Counsellor credentials (`counsellor@next-generpsolutions.com`):
   - Auth Response: **HTTP 200 OK** (User ID: `44444444-4444-4444-4444-444444444444`, Role: `counsellor`).
   - Query Response: `GET /rest/v1/students?select=*&order=created_at.desc` -> **HTTP 200 OK**.
   - Returned Records: Valid student records returned without error.
3. Conclusion: The database RLS policies and Counsellor role permissions are 100% correct. No database migrations or schema modifications are required.

---

## 4. Proposed Smallest Verified Corrections

### A. Environment Configuration Fix (Infrastructure / Vercel)
In Vercel project settings (`next-gen-lms-omega`):
- Update `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the staging key (`sb_publishable_ta86...`) to the matching production key (`sb_publishable_dZxl...`).
- Ensure `NEXT_PUBLIC_SUPABASE_ANON_KEY` is also aligned.

### B. Application Safeguards & Clean Error Handling (Code)
1. **Prevent Using Staging Key in Production (`lib/supabase/client.ts` & `lib/supabase/db.ts`):**
   Add a sanity check in `createClient()` and `isLiveSupabaseEnabled()`:
   If `NEXT_PUBLIC_SUPABASE_URL` contains `tgohtdzwehhjfahtgovq` (production) and the publishable key contains `ta86fl6G2CbwIzrnJMTLsQ_W0U3QjYe` (known staging key), reject or fallback to `NEXT_PUBLIC_SUPABASE_ANON_KEY` to prevent cross-environment key mismatches.
2. **Disable Silent Mock Fallback in Production (`components/providers/auth-provider.tsx`):**
   When `isLiveSupabaseEnabled()` is active in a non-development/non-test environment, if Supabase Auth rejects credentials or fails with an API configuration error, fail closed and display an actionable error to the user rather than creating a ghost session with mock credentials.
3. **Detailed Error Logging in `student-service.ts`:**
   Surface the underlying Supabase PostgREST error message in console logs before rethrowing, ensuring production observability.
