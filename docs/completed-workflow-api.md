# Completed Local Project Workflow

POST `/api/admin/workflow` uses the existing Clerk admin role check. It is not a
public upload endpoint and never publishes a property. Only an existing draft
property and one stable `splatItems.id` may be changed. Migration 0018 is required.

1. `reserve`: binding contains propertyId, sceneId, expectedUpdatedAt, previousUrl,
   revision, projectSha256, archiveSha256, archiveMd5 and archiveBytes. The actor
   and complete binding determine one immutable reservation/asset. Retry reuses it.
2. PUT to the returned signed storage URL with exactly the returned Content-MD5
   and If-None-Match headers. The object is write-once. A retry receiving 412 must
   verify the existing object, not overwrite it. Ready reservations omit PUT.
3. `verify`: key only. R2 HEAD checks stored size and R2's MD5 checksum and returns
   a signed GET URL. The desktop client streams it and checks full SHA-256.
4. `attach`: key and verifiedSha256. This is the authenticated admin client's
   verification attestation, NOT a server-computed SHA-256. Server checks storage
   again, then updates URL/size only, using an exact raw-JSON/updatedAt CAS and
   reads it back. Repeated attachment to the same asset does not change timestamps.

MD5 is a transport corruption check, not collision-resistant identity. The
desktop client's SHA-256 is the content identity gate. No ZIP is buffered or
hashed in full in the Worker. Signed URLs and session tokens must never enter
logs, project state or exported ZIPs. Unknown origins/redirects are rejected by
the desktop adapter. Storage origins come from trusted configuration.

This does not make generic propertyRepo.upsert writers conditional. An editor
can intentionally change the property later; this route guards its own save.
No QA package or draft is approved for client publication by these endpoints.

Tests: route request/response with real SQLite and mocked auth/storage, actual
aws4fetch signature header binding, conditional helper and reservation retries.
Live authenticated R2 execution is a separate deployment check, not implied by
these tests. Source: https://developers.cloudflare.com/r2/api/s3/api/
