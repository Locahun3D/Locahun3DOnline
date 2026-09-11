# Online collision source identity contract

2026-09-11. Implementation scope: the three asset-serving routes and their
regression tests only. No build, push, deployment, viewer/runtime/217b changes,
database mutations, billing or signed-download changes.

## Header retrieval

- `/api/demo-asset/Kousaten_ForDemo_point_cloud.rad`: fixed public allowlist.
- `/api/viewer-stream/<key>`: same-origin authenticated resource. HEAD executes
  the same user/plan/free-period and restricted/NDA checks as GET, before R2.
- `/api/r2/<key>`: public non-3DGS resources only. Geometry formats remain blocked
  for HEAD as well as GET. It is not an alternate route to private scans.

All three now explicitly export HEAD and return R2 `httpEtag` (quoted) and
`uploaded` as Last-Modified for full and ranged responses. Normal HEAD uses
`bucket.head`, fetching no object body. Range HEAD follows existing GET range
handling, cancels the returned stream and emits no body. Error HEADs are also
bodyless. Full GET uses one R2 get; Range still uses one ranged get. Range
parsing/status behavior was not redesigned. Conditional requests (If-Range,
If-Match, If-None-Match) are not newly implemented.

General R2 HEAD bypasses its Worker GET cache and cannot write a bodyless GET
cache entry. Its GET cache policy is unchanged; a cached GET might be an older
version than fresh HEAD. Compare the actual GET/range ETag to the chosen source
version, or fail closed. Do not pair a fresh HEAD ETag with unchecked old bytes.
For mutable URLs request fresh identity using `cache: 'no-store'`; browser cache
control is not a guarantee that every intermediary ignores its own caching.

No CORS origins, credential policy or OPTIONS methods were expanded. These online
routes are same-origin; the standalone viewer's demo route separately permits
cross-origin reads. A file-origin caller needing the public demo should use the
standalone `https://viewer.locahun3d.com/api/demo-asset/...` endpoint. Private
HEAD uses the authenticated online origin, not a public CORS workaround.

`/api/viewer-asset` remains an authorization/unlock/signed-GET issuing endpoint,
not a HEAD metadata service. Do not invoke it just to probe identity (it can
affect unlock/billing state), or assume a GET-signed URL also authorizes HEAD.

## Shared source key recommendation

ETag plus byte length alone is NOT a cross-resource identity. Use a tagged tuple
with a trusted canonical resource identifier; retain the quotes in strong ETags:

```js
// Browser and prebuilder must use the exact same tuple and ordering.
const remoteIdentity = ["resource-etag-v1", canonicalResourceId, httpEtag];
const localIdentity = ["bytes-sha256-v1", verifiedFullByteSha256];
```

`canonicalResourceId` should be either:

1. An absolute canonical asset URL including origin and resource-significant
   query parameters. Never use pathname only: origins/tenants may differ.
2. An authorized stable storage tuple, for example a JSON-serialized tuple of
   service namespace, tenant, bucket and exact object key, supplied by the trusted
   metadata service. This enables explicit online/standalone aliases if desired.

Do not guess that two URLs resolve to the same storage key. Do not strip arbitrary
queries, authorization query fields, or path prefixes to infer aliases. Known
transport-only parameters may be omitted only under an explicit endpoint
contract; signed URLs are capabilities, never persisted canonical identifiers.
The current routes do not return a storage identity header, so use the exact
approved canonical URL and keep different route origins distinct by default.
All chosen identities should also carry expected full byte size separately as a
consistency guard. On 206 this is the Content-Range total, not Content-Length.

Local verified full-byte SHA-256 is path-independent: copying the same bytes to
another folder may reuse a content-bound bake, provided transforms and all bake
inputs also match. Trust neither a hex-looking filename nor an arbitrary remote
ETag formatted like `sha256-...`. The local server/helper must actually hash the
bytes, or the browser must hash the full Blob/File. The trusted local server's
`"sha256-<digest>"` ETag may be mapped to `localIdentity` only for that known
actual-byte-hashing endpoint. Last-Modified, length and point count never replace
content identity. Missing/weak ETag means complete byte hashing or no persisted
reuse, not a URL-only fallback.

Parent can retain its proposed outer hash, but freeze the following together in
baker and runtime (including key names, array ordering and number serialization):

```js
SHA256(JSON.stringify([
  "whole-v1", voxelResolution,
  visibleSources.map(source => ({
    identity: source.identity, // one of the tagged tuples above
    matrixWorld: source.matrixWorld // exact, unrounded 16 elements
  })),
  selectedColliderAndExclusionSignature
]));
```

Any identity-format change invalidates previous manifests; both sides must adopt
it together. Version/decoder/leaf-selection rules must be covered by whole-v1 or
explicitly included. The collider/exclusion signature must bind actual geometry,
selection and transforms, not names/counts alone. Update world matrices before
capture and include all importer/parent transforms. Persisted asynchronous results
must still match the current source generation when they finish.

A public manifest mapping this key to `./collision/<key>.lct` must be trusted
(bundled/release-pinned or signed with a pinned verification key), bind the exact
source key, codec/version, full coverage, payload SHA-256 and byte size, and verify
payload bytes before decode. A signed download URL is not a signed source-to-proxy
relationship. Private collision distribution must enforce the original source
permissions; no public cache of private geometry.

## Verification and parent integration

Run `node node_modules/vitest/vitest.mjs run src/app/api/asset-identity.test.ts`.
Tests invoke the real NextRequest/NextResponse route handlers with mocked R2/auth
dependencies. They cover full/range GET and HEAD, body cancellation, ETag changes
at equal byte size, error HEADs, protected source blocking, login/plan/NDA/free
period decisions, unexpanded CORS and cache-body integrity. This is not a claim
of deployed Cloudflare verification.

Remaining parent steps: wire the shared scoped identity tuples into 217b and the
baker, regenerate affected manifests, validate every fetched source version and
proxy payload, then separately authorize deployment and verify browser-readable
HEAD/GET/range headers on the deployed routes. The earlier standalone contract's
online-HEAD-pending note is superseded by this source implementation, not by a
deployment. Existing source/project dirty changes were preserved.
