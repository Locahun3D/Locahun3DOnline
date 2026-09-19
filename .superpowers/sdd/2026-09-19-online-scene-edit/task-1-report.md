# Task 1 — server scene-edit transaction

## Implemented

- POST `/api/scene-edit`: strict 8192-byte JSON actions `target`, `reserve`, `verify`, `attach`; same-origin checks; current actor and existing `assertPropertyAccess` authorization on every operation.
- Immutable actor-bound 24-hour target records in existing `workflow_uploads`, purpose `scene-edit-v1`. `propertyRevision` is SHA-256 of exact raw JSON, not reconstructed JSON. Reserve and target records cannot replay through the existing draft-only workflow.
- Draft/published supported; archived/missing/inconsistent/duplicate-ID scenes rejected. Raw JSON, status and timestamp participate in conditional UPDATE; exactly one affected row required, with readback before receipt. Idempotent attachment requires current URL/size plus matching history receipt.
- Only selected preview URL/size and property timestamp change; old preview URL/size retained in optional `editVersions`. Other scene fields, including unknown fields, price/download/access data, and property status remain untouched.
- Write-once upload credentials use the existing Content-MD5 + If-None-Match signer. Verify checks R2 length/MD5, then browser downloads signed GET and submits matching SHA-256 before attach.
- GET/HEAD `/api/scene-edit/source?sessionKey=...`: authorized actor/session/source/snapshot checked before streaming R2, with Range and no-store; no paid viewing/unlock call and no full-file buffering. Caller-supplied URL fields rejected.
- Old legacy source is registered when missing, new preview registered through immutable reservation. Historical references survive schema parsing and count as asset usage, including URL aliases with the same registered R2 key.
- Reference-aware delete guards cover asset-library delete, legacy delete action, delete helper, and repository remove (including generic stale-upload cleanup). Scene-edit reservations remain protected after expiry. Existing `wf_*` objects cannot receive overwrite credentials via replace-presign.
- Cache invalidation covers JA/EN catalog/detail, property admin/edit and dashboard.

## Concrete browser contract

All actions POST `/api/scene-edit` with JSON.

- `target`: `{action:'target',propertyId,sceneId}` -> `{target,sourceUrl,fileName,storageOrigin}`.
- `target`: `{propertyId,sceneId,expectedUpdatedAt,previousUrl,propertyRevision,expiresAt,sessionKey,status:'draft'|'published'}`. Timestamps are ISO strings, revision/session are 64 lowercase hex.
- `reserve`: `{action:'reserve',target,digest:{revision,projectSha256,archiveSha256,archiveMd5,archiveBytes}}` -> `{key,id,status,url,putUrl?,headers?}`. Digest revision is nonnegative integer, SHA256 fields 64 hex, MD5 32 hex, archive 1..2 GiB. Client may use archive SHA for project SHA, which is a binding field.
- `verify`: `{action:'verify',key}` -> `{key,id,downloadUrl,bytes,sha256}`.
- `attach`: `{action:'attach',key,verifiedSha256}` -> `{status:'attached'|'already_attached',key,propertyId,sceneId,url,updatedAt}`.
- Authentication/authorization 401/403; stale/expired/integrity/scene conflicts 409; unavailable storage 503; bad input 400/413/415. Source also returns 404/416.

## Evidence

- Baseline before implementation: `npm test`, 59 files / 351 tests passed.
- Core TDD RED: scaffold-only implementation produced 12 assertion failures / 13 cases (expected 200/401/403/409 vs 501; missing strict schema/source resolution/history); raw-preimage rejection returned false already in stub and was subsequently tested with real SQLite.
- Source TDD RED: 3 expected assertion failures vs 501. GREEN: authorized streaming + HEAD/Range, revoked/different actor, changed preimage, invalid ranges/origin/arbitrary URL.
- Cleanup TDD RED: alias recovery reference missing; reservation/history delete incorrectly 200; immutable overwrite incorrectly 200. GREEN after guards.
- Central-guard TDD RED: legacy action deleted object; repository remove accepted protected asset; helper returned null. GREEN after wiring all callers.
- Final `npm test`: 67 files / 392 tests passed (includes concurrent client work).
- `npx tsc --noEmit`: exit 0.
- Targeted ESLint for new server source/tests, source/POST routes, asset usage, asset update, replace-presign, and legacy-action test: exit 0.
- `git diff --check`: exit 0; only repository CRLF normalization notices.
- No push, deploy, production writes, or credentials printed. Parent owns real-browser/real-3D integration evidence; this task does not claim those checks.

## Deliberate limitations / operations

- This route requires D1 + R2. Local JSON-only development fails closed with 503; no authentication bypass.
- Supported editable sources are existing internal `assets/splat/` or `uploads/` files, `.zip/.rad/.ply/.splat/.ksplat`. Foreign absolute URLs, traversal/encoded paths, arbitrary URL fetches, unknown formats fail closed.
- Reservations and original/new project assets are retained rather than automatically garbage-collected, even after an edit session expires. This prevents attach/delete races. Abandoned-job storage reclamation needs a separate reviewed lifecycle, not the generic unused-assets button. Rejection includes a scoped Japanese explanation.
- Uses existing migration `0018_workflow_uploads.sql`; no new migration. Existing production draft-workflow route remains unchanged and draft-only.
- No ZIP content semantic validation on server: storage integrity is checked and the authenticated client verifies downloaded SHA; viewer/export correctness remains parent/client responsibility.
