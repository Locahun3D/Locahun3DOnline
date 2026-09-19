# Online Scene Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edit an uploaded scene from the property editor and save back to the same scene without losing the original.

**Architecture:** A dedicated authenticated scene-edit page hosts the existing viewer and owns the upload transaction. A strict viewer bridge produces a complete project archive; a separate API checks permissions, reserves immutable storage, verifies uploaded bytes and conditionally replaces only the scene's preview asset. Do not broaden the draft-only workflow API.

**Tech Stack:** Next.js 16.2.6, React 19, TypeScript, Clerk, D1, R2, existing Spark viewer and fflate.

**Spec:** `docs/online-scene-edit-design-20260919.md`

## Global Constraints

- Same scene ID; retain original R2 object and recovery reference.
- Preserve price, sales files, access permissions and property publication state.
- Recheck administrator/property-editor authorization for every API operation.
- Existing dirty built viewer files are not implementation sources. Work in isolated checkouts; build canonical viewer source.
- No push or production deploy without explicit instruction.
- Verify real scene round-trip and screenshots at 1440/820/390; run design-fb-audit.py.
- Read the installed Next.js route-handler documentation before route implementation.
- Public properties reflect successful save; show this explicitly before saving.

## Existing code findings

- Online `src/app/api/admin/workflow/route.ts` and `src/lib/conditional-scene-attachment.ts` only accept draft properties. Keep that restriction intact.
- `src/lib/workflow-upload-reservation.ts` provides immutable, actor-bound upload reservations; `src/lib/uploads.ts` provides Content-MD5 / If-None-Match uploads and HEAD verification.
- `src/lib/workflow-hash-client.ts` provides streaming archive SHA256/MD5, including large-file fixes. Reuse it.
- Canonical viewer `../Locahun3D/src/js/310_zip_project_save_load_fflate.js` supports `saveProjectZip(false,{returnBlob:true})`, but may omit data on phones, retain stream URLs or swallow export errors. It is NOT safe for online replacement unchanged.
- Event images are serialized as `eventImage` and `eventImageName`; path points, labels, transforms and initial camera already have serialization.
- Property editor uses autosave and timestamps. Returning from scene save must refresh the editor; never overwrite unsaved form data silently.

## Shared contracts

```ts
type SceneEditTarget = {
  propertyId: string; sceneId: string; expectedUpdatedAt: string;
  previousUrl: string; published: boolean;
};
type SceneEditDigest = {bytes:number; sha256:string; md5:string};
type SceneEditReceipt = {
  propertyId:string; sceneId:string; url:string; updatedAt:string;
};
// Browser bridge: same origin AND exact iframe contentWindow required.
type SaveRequest = {type:'locahun:scene-export'; requestId:string};
type SaveReply =
  | {type:'locahun:scene-exported'; requestId:string; archive:Blob}
  | {type:'locahun:scene-export-error'; requestId:string; code:string};
```

## Task 1: Safe server transaction

**Files:** Create `src/lib/scene-edit-contract.ts`, `src/lib/scene-edit-attachment.ts`, their `.test.ts` files, `src/app/api/scene-edit/route.ts` and `route.test.ts`. Read `src/lib/dal.ts`, property editing authorization, `uploads.ts`, workflow reservation and tests. Add `src/lib/schemas.ts` optional per-scene `editVersions` field to retain old preview URLs through ordinary property saves.

**Interfaces:** API POST accepts strict discriminated actions `target`, `reserve`, `verify`, `attach`. Target returns SceneEditTarget. Reserve consumes target and SceneEditDigest, returning immutable upload key and signed PUT. Verify checks stored length/MD5 and returns signed GET. Attach requires matching downloaded SHA256 and returns SceneEditReceipt. Reject unknown fields, cross-site Origin and requests above 8192 bytes. Use the existing actor/property authorization logic, not a new owner interpretation.

- [ ] Write failure tests before implementation. Example assertions:
```ts
expect(await saveAs(otherPropertyActor, target)).toMatchObject({status:403});
expect(await saveAgainstChangedRevision(target)).toMatchObject({status:409});
expect(afterScene.id).toBe(beforeScene.id);
expect(afterScene.downloadFileUrl).toBe(beforeScene.downloadFileUrl);
expect(afterScene.salePrice).toBe(beforeScene.salePrice);
expect(afterScene.accessLevel).toBe(beforeScene.accessLevel);
expect(afterScene.editVersions.at(-1).url).toBe(beforeScene.splatUrl);
```
Use the database/mock setup already present in workflow route tests. Cover missing/duplicate scene IDs, archived/deleted property, wrong owner, changed source URL, byte mismatch, repeated attach and storage failure.
- [ ] Run `npx vitest run src/lib/scene-edit-attachment.test.ts src/app/api/scene-edit/route.test.ts`; confirm failures reflect absent functionality.
- [ ] Implement schema validation and immutable reservation with purpose `scene-edit-v1` in the reservation binding/hash, preventing replay through the draft workflow. Bound previous URL must be an existing supported internal upload, not an arbitrary fetch URL.
- [ ] Use exact raw property preimage, status and timestamp for conditional update:
```sql
UPDATE properties SET data=?, updated_at=?
WHERE id=? AND status=? AND updated_at=? AND data=?
```
Replace only selected scene splatUrl/sizeMb, append prior preview reference and update timestamp. Require exactly one affected row; read back to verify. Invalidate affected property paths after success. Keep both old and new assets registered/referenced so unused-asset cleanup cannot delete recovery data.
- [ ] Re-run tests, TypeScript check and commit only task files.

## Task 2: Strict complete viewer export and restore

**Files (canonical viewer repo):** Modify `src/js/310_zip_project_save_load_fflate.js`; locate and modify its corresponding loader/restore source using `rg -n 'loadProjectZip|restoreProject' src/js`. Create `src/js/432_online_scene_edit.js` and `scripts/test-online-scene-edit.mjs`; register source according to `build.mjs` ordering if needed.

**Interfaces:** `saveProjectZip(false,{returnBlob:true,strictOnline:true})` returns complete Blob or rejects. `onlineSceneEdit` query enables the bridge only inside a same-origin authorized editor parent. Save reply follows Shared contracts. No authentication token goes into the viewer URL or ZIP.

- [ ] Add failing tests for strict exports: missing raw asset, failed streamed fetch, unsupported layer, active unfinished path and phone lite-save condition must reject instead of producing a partial archive.
```js
await assert.rejects(exportFixture({missingAsset:true}), /incomplete/i);
await assert.rejects(exportFixture({forcePhoneLite:true}), /capacity/i);
const roundtrip=await exportAndRestoreFixture({path:true,eventImage:true,transform:true});
assert.deepEqual(roundtrip.pathPoints, original.pathPoints);
assert.equal(roundtrip.eventImage, original.eventImage);
assert.deepEqual(roundtrip.pos, original.pos);
```
- [ ] Run `node scripts/test-online-scene-edit.mjs` and confirm RED.
- [ ] In strictOnline mode reject unsupported layers and missing data, disable URL-reference fallback, throw on all export failures and prohibit silent phone lite saves. Skip bundling viewer HTML for online archives. Include regional navigation assets where present. Validate archive has project.json and every asset entry before sending it to parent.
- [ ] Track completed restoration before announcing ready; a partially restored project must never become saveable. Block editing during serialization; reject stale/out-of-order request IDs. Limit message origin/source; ignore unsolicited replies. Warn on unload while dirty or saving.
- [ ] Run tests and build with `node build.mjs` in the isolated viewer checkout. Do not overwrite the user's dirty online viewer artifact. Record SHA256 of built candidate for integration.

## Task 3: Editor page and scene entry point

**Files:** Create `src/app/scene-edit/[propertyId]/[sceneId]/page.tsx`, `src/components/admin/scene-editor.tsx`, `src/components/admin/scene-editor.module.css`, `src/lib/scene-edit-client.ts`, `src/lib/scene-edit-client.test.ts`. Modify `src/components/admin/property-editor.tsx` only at scene action controls. Use isolated generated viewer artifact for development/verification.

**Interfaces:** Client uses Task1 target/transaction endpoint, Task2 bridge, `runWorkflowHash`. Page checks authorization before returning viewer URL; signed read URL stays transient, not in saved state. Client verifies server-provided storage origin against the configured storage origin. Return navigation points to the same property editor.

- [ ] Write failing client tests for wrong iframe/source/origin, duplicate replies, readback mismatch, session expiry, network interruption and cancellation. Use injected fetch/hash/bridge in the client for deterministic tests:
```ts
expect(await receive({origin:'https://evil.invalid',source:iframe}, validReply)).toBe(false);
expect(await receive({origin:ownOrigin,source:anotherFrame}, validReply)).toBe(false);
expect(await saveWithFailedPut()).toMatchObject({phase:'error',attached:false});
expect(await saveWithConflict()).toMatchObject({phase:'conflict',attached:false});
```
- [ ] Run `npx vitest run src/lib/scene-edit-client.test.ts` and confirm RED.
- [ ] Add edit link by stable stored scene ID; when form is dirty require existing successful save first, not a guessed field-array ID. Open separate editor tab. Show scene name, return link, save status and primary save button. Display publication warning only for published targets.
- [ ] On save: export complete archive → streaming digest → reserve → immutable PUT → HEAD verification → downloaded SHA256 verification → conditional attach → success. Successful repeated save uses returned updatedAt and new URL; failed save retains previous target and unsaved state. No automatic forced conflict retries.
- [ ] Notify source property editor of success with same-origin exact-window checks. Refresh only when its form is clean; otherwise show reload-needed conflict without resetting user edits. Do not let autosave silently restore the old URL.
- [ ] Re-run tests, `npx tsc --noEmit` and commit task files.

## Task 4: Integration and visual verification

**Files:** Create `scripts/verify-online-scene-edit.mjs`, save review evidence under `artifacts/online-scene-edit/`, update approved design with actual limits. Integrate generated viewer only after comparing its base with the dirty live artifact and confirming no unrelated viewer changes are replaced.

- [ ] Test an actual project fixture (not production writes): load → add path/region → move/rotate → add image → save → destroy old viewer context → open saved scene. Compare layer values and screenshots and confirm original asset SHA256 unchanged.
- [ ] Test single uploaded 3DGS and existing ZIP, two scenes in one property, published/draft, interrupted upload and simultaneous edit. Inspect resulting property and sales files unchanged.
- [ ] Exercise 1440/820/390 entry and save UI in real Chrome. Capture and visually inspect path/labels/image and transformed scene. Do not call emulation a real iPad Safari test.
- [ ] Run `npm test`, `npx tsc --noEmit`, `python scripts/design-fb-audit.py`; run relevant canonical viewer regression tests. Report failures honestly; no completion claim if round-trip is unverified.
- [ ] Review authorization, lost-update behavior, asset cleanup recovery references and stale autosave interactions. Commit only verified scoped changes. Hand off with screenshots and explicit no-deploy status.

## Execution approach

API transaction and strict viewer export can be implemented in parallel under their separate repository/file ownership. Integrate client only after both contracts pass. Final verification is serial and uses the combined candidate. No production upload, publication, push or deployment is part of this plan.
