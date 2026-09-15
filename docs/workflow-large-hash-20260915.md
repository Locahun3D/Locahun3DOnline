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
- Runtime commit 408cde2 pushed and deployed; Actions34955504203 completed successfully. Public home and health endpoint returned200.
- Downloaded public Worker /_next/static/chunks/8764.80973de6aa9873f1.js matched the local production build SHA25624b0b7fb5904f9a84c77f115bc8a04f6311608318b13d83026ba97f89e9bef27. Executed its unmodified bytes in Chrome using the classic Worker mode emitted by Next webpack. 2GiB SHA256/MD5 passed again:33411ms including reference hashing,3112 UI ticks. Ordinary16MiB and cancellation also passed. This verifies the shipped hashing program, not an authenticated2GiB network transfer.
- npm run build exited0 with existing optional canvas and recommended local environment warnings. Expired-attach390px screenshot inspected; controls and feedback fit. No layout changes.
- Anonymous admin/workflow is not an authenticated operator check. A locally built admin page chunk name was not present publicly (500); do not equate environment-dependent page chunk names with CI output. Public Worker name and bytes above were independently verified.

## Separate saved collision inspection

- Read-only inspection of the available Dropbox2FStudio project revision2: saved collision decoded correctly,152 tiles,16890 boxes,0.25m cells; two tiles intersect the saved spawn neighborhood. Original project unchanged. This does not identify or resolve the user's unspecified unready scene.
