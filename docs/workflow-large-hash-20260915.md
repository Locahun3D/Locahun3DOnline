# Large archive verification, 2026-09-15

## Reproduced and fixed

- Actual Chrome File/Worker hashing of 2147483648 zero bytes returned the wrong SHA256 with @aws-crypto/sha256-js 5.2.0. MD5 and byte count matched Node.
- Installed RawSha256.js writes the high 32-bit message length with little-endian=true, while SHA256 requires big-endian. This affects streams at/above 512MiB. Do not modify node_modules or work around this by buffering the entire archive.
- Workflow hashing now uses @noble/hashes/sha2, pinned to the already installed 1.8.0. Incremental reads, Worker isolation, cancellation, length bounds and MD5 remain unchanged. Renderer and viewer bundles are untouched.
- Red/green browser test: node scripts/test-workflow-hash-browser.mjs --large. Correct SHA256 a7c744c13cc101ed66c29f672f92455547889cc586ce6d44fe76ae824958ea51, MD5 a981130cf2b7e09f4686dc273cf7187e. Fixed run 33223ms including Node reference hashing; 3091 UI timer ticks. Also passed ordinary 16MiB and abort checks. Generated sparse temporary fixture is removed after the test; this is not a valid customer ZIP and is never uploaded.
- Browser panel tests at 1440/820/390 widths pass: HTTP401 during reserve, verify and attach prevents attachment; retry recovers without another PUT. Held PUT/GET cancellation and late response checks also pass. This simulates authentication rejection, not a forced expiry of the user's real session.
- All 341 unit tests and TypeScript pass.

## Remaining evidence limits

- 2GiB network upload/readback against live storage has not been performed. The previous 128MiB live test remains separate evidence.
- Physical iPhone/iPad and a second PC are not accessible from this environment. Browser fixture results do not establish physical-device success.
- This commit requires online deployment and public hash Worker verification. Record those results after publication.
