# LMS test results — 26 October 2026

Tested the current working copy, including pre-existing uncommitted changes. Application source was not changed.

| Check | Result |
| --- | --- |
| Vitest suite | 695 tests passed across 53 files |
| TypeScript | Passed |
| ESLint | Passed with 28 warnings |
| Isolated production build | Passed; generated 48/48 static pages |
| Chrome login at 375px and 1440px | HTTP 200, form present, no horizontal overflow or page JavaScript errors |
| Anonymous dashboard, portal, fees, users | HTTP 307 redirects to login |
| Anonymous database backup API | HTTP 401 |

Lint warnings concern React hook dependencies and unoptimized images. Exact locations are in `lint-verified.log`.

The first build shared generated output with an existing development server and failed with missing page modules. Browser checks initially timed out and then returned 404. Restarting the development server restored login. Building a separate copy passed, supporting generated-output interference as the explanation. A temporary copy on another drive also encountered Windows module-resolution errors; the successful copy used the project's drive.

PowerShell captured npm notices as native-command errors despite all tests passing. A direct lint run and the isolated build each returned exit code 0.

Authenticated browser workflows, live database policies, real payment/email/video integrations, and load testing remain unverified. Existing browser scripts include legacy cookie fixtures and hard-coded accounts that require validation before use. These checks do not establish full production readiness.

Evidence: `test-run.log`, `typecheck-run.log`, `lint-verified.log`, `build-isolated.log`, and `smoke-verified.log`. Initial failed attempts are retained in `build-run.log` and `browser-run.log`.

Repeat the observational browser smoke check with `node scripts/audit-smoke-check.mjs` while the local server runs on port 3000.

Automatic execution policy blocked cleanup of temporary build directories. The `.audit-build-check` directory and the temporary directory recorded in `build-check-path.txt` remain on disk, including dependency junctions and copied local configuration. Do not commit these temporary copies.
