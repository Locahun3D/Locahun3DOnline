# Workflow Operator Entry, 2026-09-14

Admin-only /admin/workflow connects existing draft destination IDs, explicit
project.zip/receipt.json selection and the workflow reservation/verification/
attachment API. Clerk sessions are refreshed via the supported SDK for every
administrative call and never persisted or sent to storage. Snapshot persistence
is keyed by origin, actor, source/archive identity, revision and destination IDs;
Web Locks serialize repeated transfers. No publication or sharing action exists.

The page queries D1 without the store's legacy auto-assignment/writeback behavior.
Mismatched property IDs and duplicate scene IDs are excluded. Source selection
alone performs no transfer. Cancellation terminates hashing and aborts requests.

## Verified

- 339 unit tests pass; TypeScript and scoped ESLint pass.
- Production Next webpack build succeeds, including worker bundling.
- design-fb-audit.py: 29 OK, 0 NG.
- Real Chrome isolated fixture at1440/820/390 widths exercises actual React panel,
  file selection, real hashing Worker, browser fetch, repeated successful transfer,
  corrupt download, mismatched CORS origin and cancel. No duplicate PUT on retry;
  failures/cancel do not attach. No page exceptions or horizontal overflow.
- Screenshots reviewed in artifacts/workflow-panel. Fixture HTML initially lacked
  UTF8 declaration; corrected before review. It is not a production encoding bug.
- Hash Worker separately verifies16MiB against Node SHA/MD5 with responsive main
  thread. CPU-heavy checks are not performed on the UI thread.

## Limits

Browser requests in the fixture are fulfilled with isolated synthetic responses;
this does not verify live R2 CORS or a real authenticated Clerk session. The SDK
adapter is connected but real admin live transfer remains unverified. Do not
bypass the earlier browser API block or unauthorized D1 lookup. No original
2FStudio, listing, source status, client approval or share link was changed.
Physical mobile devices and complete admin-shell screenshots remain unverified.

Existing build warnings include optional linkedom canvas and missing recommended
local Stripe/app URL settings; the build exits successfully. Adding direct pinned
hash dependencies changes no installed versions; npm reported36 total existing
dependency vulnerabilities, without a broad automatic upgrade.

Run: node scripts/test-workflow-panel-browser.mjs and
node scripts/test-workflow-hash-browser.mjs. These use installed Chrome.
