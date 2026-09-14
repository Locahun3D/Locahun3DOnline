# Workflow Operator Entry, 2026-09-14

## Authorized live verification, 17:19 JST

- User explicitly approved a separate nonpublic test property/scene and dummy
  upload. Normal authenticated Chrome created only st-005 (fictional QA facility),
  scene4fdd112a-b203-4eaa-84bc-6645d6b7b96e. Existing studios were not edited.
- The real completed exporter generated a1495-byte ZIP containing one synthetic
  PLY point, SHA256 be5eabcee92e3922fd0172707553747e6ecba6f7bb3f4fa7a7c57f42297e69eb.
  Files remain in F:/Codex/locahun-workflow-live-20260914 for reproducible testing.
- Initial live transfer failed. Safe diagnostics f832d6a, Actions34821275640
  success, localized the failure to uploading/network, after hashing and reservation.
  Published hash Worker independently passed a real Chrome test.
- Root cause: production R2 PUT CORS allowed only content-type, not content-md5
  or if-none-match. Existing two rules preserved; a third rule adds these headers
  only for the already-authorized https://locahun3d.com origin. No public bucket,
  additional origin, credential or weaker write-once policy was introduced.
  Applied config/r2-cors.json with Wrangler; listed remote rules to verify.
- Actual Chrome operator transfer then completed authenticated reservation,
  signed PUT, server storage checks, Worker downloaded-byte SHA256 verification,
  conditional attachment and readback. Retrying later through the same normal
  session adapter also completed. Asset library shows exactly one QA asset;
  property remains draft and updated time remains17:16 after retry.
- Attached asset: wf_4da8bec7f69c8a9c88c8a082d9b6dc4bab0890a97f9c4a3fca7838e714f5ee23.
  No original studio, approval, share link or publication was changed. Opening
  the QA editor triggered existing preview generation; it was cancelled using
  the UI. This test validates transfer, not the synthetic point's visual quality.
- node scripts/verify-workflow-cors.mjs passes real PUT and GET preflights without
  sessions or object writes. Keep this check when changing storage configuration.
  Source: https://developers.cloudflare.com/r2/buckets/cors/.
- Full suite341pass including safe diagnostics and CORS regression coverage.
  Browser fixture1440/820/390 and build/typecheck pass,
  design audit29OK/0NG. Screenshots inspected at each width and live success.

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

Browser requests in the fixture use isolated synthetic responses. Separately,
the authorized live test above now verifies R2 CORS and normal authenticated
transfer/retry. Forced credential expiry, mid-transfer sign-out and large real
archives were not exercised live. Do not bypass browser blocks or extract sessions.
No original2FStudio, listing, source status, approval or share link was changed.
Physical mobile devices and complete admin-shell screenshots remain unverified.

Existing build warnings include optional linkedom canvas and missing recommended
local Stripe/app URL settings; the build exits successfully. Adding direct pinned
hash dependencies changes no installed versions; npm reported36 total existing
dependency vulnerabilities, without a broad automatic upgrade.

Run: node scripts/test-workflow-panel-browser.mjs and
node scripts/test-workflow-hash-browser.mjs. These use installed Chrome.
