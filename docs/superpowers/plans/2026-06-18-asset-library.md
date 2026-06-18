# Asset Library + R2 Storage Foundation — Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-admin asset library backed by Cloudflare R2 (presigned direct upload) so 3DGS/image files are managed independently of properties, then referenced from the property editor by "pick from library".

**Architecture:** File bytes live in R2 (`locahun3d-assets`); a JSON index (`data/assets.json`) via a new `AssetRepo` mirrors the existing `PropertyRepo` pattern. Uploads use presigned PUT URLs (browser→R2 direct). A `UPLOAD_MODE=local` fallback writes to `public/uploads/` so everything runs without R2 keys during dev. Pure helpers (keys/validation/usage) are unit-tested with vitest; API routes + UI are verified on the dev server.

**Tech Stack:** Next.js 16 (App Router) + TypeScript, zod 4, nanoid 5, react-hook-form, Tailwind v4, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (new), vitest (new, for unit tests).

**Repo:** `F:\Htlml\3DGS\locahun3d_online` (run all commands from here).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `vitest.config.ts` | Create | Vitest config (node env, `@/` paths, stub `server-only`) |
| `test/empty-module.ts` | Create | Empty module aliased for `server-only` in tests |
| `src/lib/asset-keys.ts` | Create | PURE: upload limits/constants, `safeName`, `buildAssetKey`, `buildPublicUrl`, `validateUploadMeta` |
| `src/lib/asset-usage.ts` | Create | PURE: `computeAssetUsage(properties, assets)` |
| `src/lib/schemas.ts` | Modify | Add `assetSchema` + `Asset`/`AssetKind`/`AssetStatus` types |
| `src/lib/store.ts` | Modify | Add `AssetRepo` + `JsonFileAssetRepo(dataFile?)` + `assetRepo` |
| `src/lib/uploads.ts` | Modify | Re-export constants from asset-keys; add `createPresignedUpload`, `deleteR2Object`, lazy R2 client |
| `data/assets.json` | Create | Empty index `{ "version": 1, "assets": [] }` |
| `src/app/api/admin/assets/presign/route.ts` | Create | Validate + create `uploading` entry + return PUT url (r2) or post url (local) |
| `src/app/api/admin/assets/local/route.ts` | Create | Local-mode multipart receiver → write `public/uploads` → finalize entry |
| `src/app/api/admin/assets/commit/route.ts` | Create | Mark `uploading`→`ready`, set width/height |
| `src/app/api/admin/assets/route.ts` | Create | `GET` list for the picker |
| `src/app/admin/_actions.ts` | Modify | Add `renameAssetAction`, `deleteAssetAction` |
| `src/components/admin/upload-client.ts` | Create | Client `uploadAsset(file, kind, {onProgress})` (presign→PUT/POST→commit) |
| `src/app/admin/assets/page.tsx` | Create | Server page: requireAdmin, list + usage → `<AssetLibrary>` |
| `src/components/admin/asset-library.tsx` | Create | Client: grid, batch upload, search/filter, rename, delete |
| `src/components/admin/asset-picker-modal.tsx` | Create | Client: modal grid → `onPick(asset)` |
| `src/components/admin/property-editor.tsx` | Modify | "ライブラリから選択" buttons in photo + 3DGS steps |
| `src/components/admin/file-dropzone.tsx` | Modify | Use shared `uploadAsset()` (unifies inline upload into the index) |
| `src/app/admin/layout.tsx` | Modify | Add アセット nav link |
| `next.config.ts` | Modify | `images.remotePatterns` for R2 host |
| `package.json` | Modify | Add deps + `test` script |
| `.env.example` | Modify | Document `UPLOAD_MODE` + R2 vars (already present) |

---

## Task 1: Tooling — vitest + AWS SDK deps

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `test/empty-module.ts`

- [ ] **Step 1: Install deps**

Run:
```bash
npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
npm i -D vitest vite-tsconfig-paths
```
Expected: installs succeed; `package.json` gains the 2 runtime + 2 dev deps.

- [ ] **Step 2: Add a `test` script**

In `package.json` `"scripts"`, add:
```json
"test": "vitest run"
```

- [ ] **Step 3: Create the server-only stub**

Create `test/empty-module.ts`:
```ts
// Aliased in vitest for "server-only" / "client-only" so node-env unit tests
// can import modules that mark themselves server-only.
export {};
```

- [ ] **Step 4: Create vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "node:url";

const serverOnlyStub = fileURLToPath(
  new URL("./test/empty-module.ts", import.meta.url),
);

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": serverOnlyStub,
      "client-only": serverOnlyStub,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 5: Verify the runner boots (no tests yet = OK)**

Run: `npm test`
Expected: vitest runs, reports "No test files found" (exit non-zero is fine here) — confirms config loads without error. If it errors on config, fix before continuing.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts test/empty-module.ts
git commit -m "chore: add vitest + aws-sdk deps for asset library"
```

---

## Task 2: Pure asset-key/validation helpers (`asset-keys.ts`)

**Files:**
- Create: `src/lib/asset-keys.ts`
- Test: `src/lib/asset-keys.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/asset-keys.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  safeName,
  buildAssetKey,
  buildPublicUrl,
  validateUploadMeta,
  MAX_IMAGE_BYTES,
} from "./asset-keys";

describe("safeName", () => {
  it("strips unsafe chars and lowercases the extension via caller", () => {
    expect(safeName("My Photo (1).JPG")).toBe("My_Photo_1_.JPG");
  });
});

describe("buildAssetKey", () => {
  it("namespaces by kind and id, keeps a lowercased ext", () => {
    const key = buildAssetKey({ kind: "splat", id: "abc123", filename: "Scene.PLY" });
    expect(key).toBe("assets/splat/abc123-Scene.ply");
  });
});

describe("buildPublicUrl", () => {
  it("joins base + key with a single slash", () => {
    expect(buildPublicUrl("assets/image/x.jpg", "https://cdn.test")).toBe(
      "https://cdn.test/assets/image/x.jpg",
    );
    expect(buildPublicUrl("assets/image/x.jpg", "https://cdn.test/")).toBe(
      "https://cdn.test/assets/image/x.jpg",
    );
  });
});

describe("validateUploadMeta", () => {
  it("accepts a valid image", () => {
    const r = validateUploadMeta({ kind: "image", filename: "a.jpg", contentType: "image/jpeg", size: 1000 });
    expect(r.ok).toBe(true);
  });
  it("rejects a non-image content type", () => {
    const r = validateUploadMeta({ kind: "image", filename: "a.txt", contentType: "text/plain", size: 1000 });
    expect(r.ok).toBe(false);
  });
  it("rejects an oversized image", () => {
    const r = validateUploadMeta({ kind: "image", filename: "a.jpg", contentType: "image/jpeg", size: MAX_IMAGE_BYTES + 1 });
    expect(r.ok).toBe(false);
  });
  it("rejects a bad splat extension", () => {
    const r = validateUploadMeta({ kind: "splat", filename: "a.zip", contentType: "application/zip", size: 1000 });
    expect(r.ok).toBe(false);
  });
  it("accepts a .ply splat", () => {
    const r = validateUploadMeta({ kind: "splat", filename: "a.ply", contentType: "application/octet-stream", size: 1000 });
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- asset-keys`
Expected: FAIL — `Cannot find module './asset-keys'`.

- [ ] **Step 3: Implement `asset-keys.ts`**

Create `src/lib/asset-keys.ts`:
```ts
/**
 * PURE helpers for asset storage keys + upload validation.
 * No `server-only` import — client components and unit tests may import this.
 */
export type AssetKind = "image" | "splat";

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
];
export const ALLOWED_SPLAT_EXTENSIONS = [".splat", ".ply", ".ksplat"];
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_SPLAT_BYTES = 1024 * 1024 * 1024; // 1 GB

export function safeName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .slice(0, 80);
}

export function extOf(filename: string): string {
  const m = /\.[A-Za-z0-9]+$/.exec(filename);
  return m ? m[0].toLowerCase() : "";
}

export function buildAssetKey(input: {
  kind: AssetKind;
  id: string;
  filename: string;
}): string {
  const ext = extOf(input.filename);
  const stem = input.filename.slice(0, input.filename.length - ext.length);
  return `assets/${input.kind}/${input.id}-${safeName(stem)}${ext}`;
}

export function buildPublicUrl(r2Key: string, publicBase: string): string {
  return `${publicBase.replace(/\/+$/, "")}/${r2Key}`;
}

export type ValidateResult =
  | { ok: true }
  | { ok: false; status: number; error: string; message: string };

export function validateUploadMeta(input: {
  kind: AssetKind;
  filename: string;
  contentType: string;
  size: number;
}): ValidateResult {
  if (input.kind === "image") {
    if (!ALLOWED_IMAGE_TYPES.includes(input.contentType)) {
      return {
        ok: false,
        status: 415,
        error: "bad_image_type",
        message: `画像形式は ${ALLOWED_IMAGE_TYPES.join(" / ")} のいずれかにしてください`,
      };
    }
    if (input.size > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        status: 413,
        error: "image_too_large",
        message: `画像は ${(MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0)} MB 以下にしてください`,
      };
    }
    return { ok: true };
  }
  // splat
  const ext = extOf(input.filename);
  if (!ALLOWED_SPLAT_EXTENSIONS.includes(ext)) {
    return {
      ok: false,
      status: 415,
      error: "bad_splat_extension",
      message: `Splat ファイルは ${ALLOWED_SPLAT_EXTENSIONS.join(" / ")} のいずれかにしてください`,
    };
  }
  if (input.size > MAX_SPLAT_BYTES) {
    return {
      ok: false,
      status: 413,
      error: "splat_too_large",
      message: `Splat は ${(MAX_SPLAT_BYTES / 1024 / 1024 / 1024).toFixed(0)} GB 以下にしてください`,
    };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npm test -- asset-keys`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/asset-keys.ts src/lib/asset-keys.test.ts
git commit -m "feat(assets): pure key + upload-validation helpers"
```

---

## Task 3: Asset schema (`schemas.ts`)

**Files:**
- Modify: `src/lib/schemas.ts` (append near the property schema/types)

- [ ] **Step 1: Add the schema + types**

Append to `src/lib/schemas.ts` (anywhere after the imports; it only uses `z`):
```ts
// ─── Asset library ───────────────────────────────────────────────
export const assetKindSchema = z.enum(["image", "splat"]);
export const assetStatusSchema = z.enum(["uploading", "ready"]);

export const assetSchema = z.object({
  id: z.string(),
  kind: assetKindSchema,
  status: assetStatusSchema.default("ready"),
  label: z.string().max(120).default(""),
  filename: z.string().default(""),
  ext: z.string().default(""),
  r2Key: z.string().default(""),
  url: z.string().default(""),
  size: z.number().int().min(0).default(0),
  contentType: z.string().default("application/octet-stream"),
  width: z.number().int().min(0).optional(),
  height: z.number().int().min(0).optional(),
  uploadedAt: z.string().default(() => new Date().toISOString()),
});

export type AssetKind = z.infer<typeof assetKindSchema>;
export type AssetStatus = z.infer<typeof assetStatusSchema>;
export type Asset = z.infer<typeof assetSchema>;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing schemas.ts.

- [ ] **Step 3: Commit**

```bash
git add src/lib/schemas.ts
git commit -m "feat(assets): asset zod schema + types"
```

---

## Task 4: AssetRepo (`store.ts`)

**Files:**
- Modify: `src/lib/store.ts`
- Create: `data/assets.json`
- Test: `src/lib/store.assets.test.ts`

- [ ] **Step 1: Create the empty index file**

Create `data/assets.json`:
```json
{
  "version": 1,
  "assets": []
}
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/store.assets.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { JsonFileAssetRepo } from "./store";
import type { Asset } from "./schemas";

let dir: string;
let file: string;
let repo: JsonFileAssetRepo;

const sample: Asset = {
  id: "a1",
  kind: "image",
  status: "ready",
  label: "Cover",
  filename: "cover.jpg",
  ext: ".jpg",
  r2Key: "assets/image/a1-cover.jpg",
  url: "https://cdn.test/assets/image/a1-cover.jpg",
  size: 1234,
  contentType: "image/jpeg",
  uploadedAt: "2026-06-18T00:00:00.000Z",
};

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "assets-"));
  file = path.join(dir, "assets.json");
  repo = new JsonFileAssetRepo(file);
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("JsonFileAssetRepo", () => {
  it("returns [] when the file does not exist", async () => {
    expect(await repo.list()).toEqual([]);
  });
  it("upserts then gets", async () => {
    await repo.upsert(sample);
    expect(await repo.get("a1")).toMatchObject({ id: "a1", label: "Cover" });
  });
  it("filters list by kind", async () => {
    await repo.upsert(sample);
    await repo.upsert({ ...sample, id: "a2", kind: "splat", ext: ".ply" });
    const splats = await repo.list({ kind: "splat" });
    expect(splats.map((a) => a.id)).toEqual(["a2"]);
  });
  it("removes", async () => {
    await repo.upsert(sample);
    await repo.remove("a1");
    expect(await repo.get("a1")).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npm test -- store.assets`
Expected: FAIL — `JsonFileAssetRepo` is not exported.

- [ ] **Step 4: Implement the repo**

In `src/lib/store.ts`: extend the imports from `./schemas` to include the asset types, and append the repo. Change the import block at the top:
```ts
import {
  propertySchema,
  assetSchema,
  type Property,
  type PropertyStatus,
  type Asset,
  type AssetKind,
  type AssetStatus,
} from "./schemas";
```
Then append at the end of the file:
```ts
// ─── Asset library repository ────────────────────────────────────
const ASSETS_FILE = path.join(process.cwd(), "data", "assets.json");

export interface AssetRepo {
  list(opts?: { kind?: AssetKind; status?: AssetStatus }): Promise<Asset[]>;
  get(id: string): Promise<Asset | null>;
  upsert(a: Asset): Promise<Asset>;
  remove(id: string): Promise<void>;
}

interface AssetStoreShape {
  version: 1;
  assets: Asset[];
}

export class JsonFileAssetRepo implements AssetRepo {
  constructor(private readonly dataFile: string = ASSETS_FILE) {}

  private async read(): Promise<AssetStoreShape> {
    try {
      const raw = await fs.readFile(this.dataFile, "utf8");
      return JSON.parse(raw) as AssetStoreShape;
    } catch (e: unknown) {
      if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code: string }).code === "ENOENT"
      ) {
        return { version: 1, assets: [] };
      }
      throw e;
    }
  }

  private async write(s: AssetStoreShape): Promise<void> {
    await fs.mkdir(path.dirname(this.dataFile), { recursive: true });
    await fs.writeFile(this.dataFile, JSON.stringify(s, null, 2), "utf8");
  }

  async list(
    opts: { kind?: AssetKind; status?: AssetStatus } = {},
  ): Promise<Asset[]> {
    const s = await this.read();
    let out = s.assets;
    if (opts.kind) out = out.filter((a) => a.kind === opts.kind);
    if (opts.status) out = out.filter((a) => a.status === opts.status);
    return [...out].sort((a, b) =>
      (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? ""),
    );
  }

  async get(id: string): Promise<Asset | null> {
    const s = await this.read();
    return s.assets.find((a) => a.id === id) ?? null;
  }

  async upsert(a: Asset): Promise<Asset> {
    const validated = assetSchema.parse(a);
    const s = await this.read();
    const idx = s.assets.findIndex((x) => x.id === validated.id);
    if (idx >= 0) s.assets[idx] = validated;
    else s.assets.push(validated);
    await this.write(s);
    return validated;
  }

  async remove(id: string): Promise<void> {
    const s = await this.read();
    s.assets = s.assets.filter((a) => a.id !== id);
    await this.write(s);
  }
}

export const assetRepo: AssetRepo = new JsonFileAssetRepo();
```

- [ ] **Step 5: Run tests to confirm pass**

Run: `npm test -- store.assets`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/store.ts src/lib/store.assets.test.ts data/assets.json
git commit -m "feat(assets): AssetRepo (JSON index) + tests"
```

---

## Task 5: Asset usage (`asset-usage.ts`)

**Files:**
- Create: `src/lib/asset-usage.ts`
- Test: `src/lib/asset-usage.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/asset-usage.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeAssetUsage } from "./asset-usage";

const props = [
  {
    id: "p1",
    cover: { src: "https://cdn/x/cover.jpg" },
    gallery: [{ src: "https://cdn/x/g1.jpg" }],
    splatUrl: "https://cdn/x/scene.ply",
  },
  {
    id: "p2",
    cover: { src: "https://cdn/x/cover.jpg" }, // reused
    gallery: [],
    splatUrl: "",
  },
] as never[];

const assets = [
  { url: "https://cdn/x/cover.jpg" },
  { url: "https://cdn/x/g1.jpg" },
  { url: "https://cdn/x/scene.ply" },
  { url: "https://cdn/x/unused.jpg" },
] as never[];

describe("computeAssetUsage", () => {
  it("maps each asset url to the property ids that reference it", () => {
    const usage = computeAssetUsage(props, assets);
    expect(usage["https://cdn/x/cover.jpg"].sort()).toEqual(["p1", "p2"]);
    expect(usage["https://cdn/x/g1.jpg"]).toEqual(["p1"]);
    expect(usage["https://cdn/x/scene.ply"]).toEqual(["p1"]);
    expect(usage["https://cdn/x/unused.jpg"]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- asset-usage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `asset-usage.ts`**

Create `src/lib/asset-usage.ts`:
```ts
/**
 * PURE: compute which properties reference each asset URL.
 * No server-only import — testable in node env.
 */
import type { Asset, Property } from "./schemas";

/** url → propertyId[] (only urls actually referenced are present). */
export function computeAssetUsage(
  properties: Pick<Property, "id" | "cover" | "gallery" | "splatUrl">[],
  assets: Pick<Asset, "url">[],
): Record<string, string[]> {
  const known = new Set(assets.map((a) => a.url).filter(Boolean));
  const usage: Record<string, string[]> = {};
  const add = (url: string | undefined, pid: string) => {
    if (!url || !known.has(url)) return;
    (usage[url] ??= []).push(pid);
  };
  for (const p of properties) {
    add(p.cover?.src, p.id);
    for (const g of p.gallery ?? []) add(g.src, p.id);
    add(p.splatUrl, p.id);
  }
  return usage;
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npm test -- asset-usage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/asset-usage.ts src/lib/asset-usage.test.ts
git commit -m "feat(assets): compute asset→property usage map + test"
```

---

## Task 6: R2 wiring in `uploads.ts`

**Files:**
- Modify: `src/lib/uploads.ts`

- [ ] **Step 1: Re-point constants to asset-keys + add R2 functions**

Replace the body of `src/lib/uploads.ts` with this (keeps `saveLocalUpload`/`handleUpload` + the exported constant names other code imports, now sourced from `asset-keys`):
```ts
/**
 * Upload abstraction.
 *  - UPLOAD_MODE=local : bytes written under public/uploads (dev, no creds).
 *  - UPLOAD_MODE=r2    : presigned PUT URLs against Cloudflare R2 (browser PUTs direct).
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { safeName, buildPublicUrl } from "./asset-keys";

export {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_SPLAT_EXTENSIONS,
  MAX_IMAGE_BYTES,
  MAX_SPLAT_BYTES,
} from "./asset-keys";

export type UploadMode = "local" | "r2";
export const UPLOAD_MODE: UploadMode =
  process.env.UPLOAD_MODE === "r2" ? "r2" : "local";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const UPLOADS_ROOT = "/uploads";

export interface SaveResult {
  url: string;
  size: number;
  contentType: string;
  width?: number;
  height?: number;
}

// ── Local mode ──
export async function saveLocalUpload(
  bucketId: string,
  file: File,
): Promise<SaveResult> {
  const id = safeName(bucketId);
  const dir = path.join(PUBLIC_DIR, "uploads", id);
  await fs.mkdir(dir, { recursive: true });
  const ext = path.extname(file.name);
  const stem = path.basename(file.name, ext);
  const filename = `${nanoid(6)}-${safeName(stem)}${ext.toLowerCase()}`;
  const abs = path.join(dir, filename);
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(abs, buf);
  return {
    url: `${UPLOADS_ROOT}/${id}/${filename}`,
    size: file.size,
    contentType: file.type || "application/octet-stream",
  };
}

// Legacy single-call upload (still used by /api/admin/upload until fully migrated).
export async function handleUpload(
  propertyId: string,
  file: File,
): Promise<SaveResult> {
  if (UPLOAD_MODE === "r2") {
    throw new Error(
      "handleUpload(local) called while UPLOAD_MODE=r2 — use the assets presign flow.",
    );
  }
  return saveLocalUpload(propertyId, file);
}

// ── R2 mode ──
function r2Env() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicBase = process.env.R2_PUBLIC_URL;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) {
    throw new Error(
      "R2 env not configured (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET / R2_PUBLIC_URL).",
    );
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBase };
}

let _client: S3Client | null = null;
function r2Client(): { client: S3Client; bucket: string; publicBase: string } {
  const env = r2Env();
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.accessKeyId,
        secretAccessKey: env.secretAccessKey,
      },
    });
  }
  return { client: _client, bucket: env.bucket, publicBase: env.publicBase };
}

/** Presigned PUT URL the browser uploads to directly. */
export async function createPresignedUpload(input: {
  r2Key: string;
  contentType: string;
}): Promise<{ putUrl: string; publicUrl: string }> {
  const { client, bucket, publicBase } = r2Client();
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: input.r2Key,
    ContentType: input.contentType,
  });
  const putUrl = await getSignedUrl(client, cmd, { expiresIn: 600 });
  return { putUrl, publicUrl: buildPublicUrl(input.r2Key, publicBase) };
}

export async function deleteR2Object(r2Key: string): Promise<void> {
  const { client, bucket } = r2Client();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: r2Key }));
}

export function r2PublicUrlFor(r2Key: string): string {
  return buildPublicUrl(r2Key, r2Env().publicBase);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. (The existing `/api/admin/upload/route.ts` still imports `ALLOWED_*`/`MAX_*` from `@/lib/uploads` — they remain re-exported.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/uploads.ts
git commit -m "feat(assets): R2 presign + delete in uploads lib (local mode preserved)"
```

---

## Task 7: API — presign route

**Files:**
- Create: `src/app/api/admin/assets/presign/route.ts`

- [ ] **Step 1: Implement the route**

Create `src/app/api/admin/assets/presign/route.ts`:
```ts
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { requireAdmin } from "@/lib/dal";
import { assetRepo } from "@/lib/store";
import { UPLOAD_MODE, createPresignedUpload } from "@/lib/uploads";
import {
  buildAssetKey,
  validateUploadMeta,
  extOf,
  type AssetKind,
} from "@/lib/asset-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await requireAdmin();

  let body: {
    kind?: string;
    filename?: string;
    contentType?: string;
    size?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const kind = body.kind === "splat" ? "splat" : "image";
  const filename = String(body.filename ?? "").trim();
  const contentType = String(body.contentType ?? "application/octet-stream");
  const size = Number(body.size ?? 0);
  if (!filename) {
    return NextResponse.json({ error: "no_filename" }, { status: 400 });
  }

  const v = validateUploadMeta({ kind: kind as AssetKind, filename, contentType, size });
  if (!v.ok) {
    return NextResponse.json({ error: v.error, message: v.message }, { status: v.status });
  }

  const id = nanoid(10);
  const ext = extOf(filename);
  const r2Key = buildAssetKey({ kind: kind as AssetKind, id, filename });
  const stem = filename.slice(0, filename.length - ext.length);

  if (UPLOAD_MODE === "r2") {
    const { putUrl, publicUrl } = await createPresignedUpload({ r2Key, contentType });
    await assetRepo.upsert({
      id,
      kind: kind as AssetKind,
      status: "uploading",
      label: stem || filename,
      filename,
      ext,
      r2Key,
      url: publicUrl,
      size,
      contentType,
      uploadedAt: new Date().toISOString(),
    });
    return NextResponse.json({ id, mode: "r2", putUrl, url: publicUrl, contentType });
  }

  // local mode — bytes go to /api/admin/assets/local next
  await assetRepo.upsert({
    id,
    kind: kind as AssetKind,
    status: "uploading",
    label: stem || filename,
    filename,
    ext,
    r2Key, // unused in local but kept for shape
    url: "",
    size,
    contentType,
    uploadedAt: new Date().toISOString(),
  });
  return NextResponse.json({ id, mode: "local", postUrl: "/api/admin/assets/local" });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/assets/presign/route.ts
git commit -m "feat(assets): presign API route"
```

---

## Task 8: API — local receiver + commit routes

**Files:**
- Create: `src/app/api/admin/assets/local/route.ts`
- Create: `src/app/api/admin/assets/commit/route.ts`

- [ ] **Step 1: Implement the local receiver**

Create `src/app/api/admin/assets/local/route.ts`:
```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { assetRepo } from "@/lib/store";
import { saveLocalUpload } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await requireAdmin();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_multipart" }, { status: 400 });
  }
  const id = String(form.get("id") ?? "").trim();
  const file = form.get("file");
  const width = form.get("width") ? Number(form.get("width")) : undefined;
  const height = form.get("height") ? Number(form.get("height")) : undefined;
  if (!id) return NextResponse.json({ error: "no_id" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });

  const pending = await assetRepo.get(id);
  if (!pending) return NextResponse.json({ error: "unknown_asset" }, { status: 404 });

  const saved = await saveLocalUpload(id, file);
  const asset = await assetRepo.upsert({
    ...pending,
    status: "ready",
    url: saved.url,
    size: saved.size,
    contentType: saved.contentType,
    width,
    height,
  });
  return NextResponse.json({ ok: true, asset });
}
```

- [ ] **Step 2: Implement the commit route (r2)**

Create `src/app/api/admin/assets/commit/route.ts`:
```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { assetRepo } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await requireAdmin();
  let body: { id?: string; width?: number; height?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "no_id" }, { status: 400 });

  const pending = await assetRepo.get(id);
  if (!pending) return NextResponse.json({ error: "unknown_asset" }, { status: 404 });

  const asset = await assetRepo.upsert({
    ...pending,
    status: "ready",
    width: body.width ?? pending.width,
    height: body.height ?? pending.height,
  });
  return NextResponse.json({ ok: true, asset });
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/assets/local/route.ts src/app/api/admin/assets/commit/route.ts
git commit -m "feat(assets): local-receiver + commit API routes"
```

---

## Task 9: API — list route + delete/rename actions

**Files:**
- Create: `src/app/api/admin/assets/route.ts`
- Modify: `src/app/admin/_actions.ts`

- [ ] **Step 1: Implement the list route (for the picker)**

Create `src/app/api/admin/assets/route.ts`:
```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { assetRepo } from "@/lib/store";
import type { AssetKind } from "@/lib/asset-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  const kindParam = url.searchParams.get("kind");
  const kind: AssetKind | undefined =
    kindParam === "image" || kindParam === "splat" ? kindParam : undefined;
  const assets = (await assetRepo.list({ kind })).filter((a) => a.status === "ready");
  return NextResponse.json({ assets });
}
```

- [ ] **Step 2: Add the server actions**

In `src/app/admin/_actions.ts`, extend the imports and append the actions.

Add to the existing imports:
```ts
import { repo, assetRepo } from "@/lib/store";
import { deleteR2Object, UPLOAD_MODE } from "@/lib/uploads";
```
(Replace the existing `import { repo } from "@/lib/store";` line with the combined one above.)

Append at the end of the file:
```ts
// ─── Asset library actions ───────────────────────────────────────
export async function renameAssetAction(id: string, label: string) {
  await requireAdmin();
  const a = await assetRepo.get(id);
  if (!a) return { ok: false as const, reason: "not_found" as const };
  await assetRepo.upsert({ ...a, label: label.slice(0, 120) });
  revalidatePath("/admin/assets");
  return { ok: true as const };
}

export async function deleteAssetAction(id: string) {
  await requireAdmin();
  const a = await assetRepo.get(id);
  if (!a) return { ok: false as const, reason: "not_found" as const };
  if (UPLOAD_MODE === "r2" && a.r2Key) {
    try {
      await deleteR2Object(a.r2Key);
    } catch (e) {
      console.error("[deleteAsset] R2 delete failed", e);
    }
  }
  await assetRepo.remove(id);
  revalidatePath("/admin/assets");
  return { ok: true as const };
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/assets/route.ts src/app/admin/_actions.ts
git commit -m "feat(assets): list route + rename/delete actions"
```

---

## Task 10: Client uploader (`upload-client.ts`)

**Files:**
- Create: `src/components/admin/upload-client.ts`

- [ ] **Step 1: Implement the shared uploader**

Create `src/components/admin/upload-client.ts`:
```ts
"use client";

import type { Asset, AssetKind } from "@/lib/schemas";

async function readImageSize(
  file: File,
): Promise<{ width?: number; height?: number }> {
  if (!file.type.startsWith("image/")) return {};
  try {
    const bmp = await createImageBitmap(file);
    const dims = { width: bmp.width, height: bmp.height };
    bmp.close();
    return dims;
  } catch {
    return {};
  }
}

function xhrSend(
  method: string,
  url: string,
  body: XMLHttpRequestBodyInit,
  headers: Record<string, string>,
  onProgress?: (pct: number) => void,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener("load", () =>
      resolve({ status: xhr.status, text: xhr.responseText }),
    );
    xhr.addEventListener("error", () => reject(new Error("network error")));
    xhr.send(body);
  });
}

/** Upload a file to the asset store; resolves with the finalized Asset. */
export async function uploadAsset(
  file: File,
  kind: AssetKind,
  opts: { onProgress?: (pct: number) => void } = {},
): Promise<Asset> {
  const dims = await readImageSize(file);

  const presignRes = await fetch("/api/admin/assets/presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind,
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      size: file.size,
    }),
  });
  if (!presignRes.ok) {
    const e = await presignRes.json().catch(() => ({}));
    throw new Error(e.message ?? e.error ?? `presign ${presignRes.status}`);
  }
  const presign = (await presignRes.json()) as
    | { id: string; mode: "r2"; putUrl: string; url: string; contentType: string }
    | { id: string; mode: "local"; postUrl: string };

  if (presign.mode === "r2") {
    const put = await xhrSend(
      "PUT",
      presign.putUrl,
      file,
      { "content-type": file.type || "application/octet-stream" },
      opts.onProgress,
    );
    if (put.status < 200 || put.status >= 300) {
      throw new Error(`R2 PUT failed (${put.status})`);
    }
    const commit = await fetch("/api/admin/assets/commit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: presign.id, ...dims }),
    });
    const data = await commit.json();
    if (!commit.ok) throw new Error(data.message ?? data.error ?? "commit failed");
    return data.asset as Asset;
  }

  // local mode
  const form = new FormData();
  form.append("id", presign.id);
  form.append("file", file);
  if (dims.width) form.append("width", String(dims.width));
  if (dims.height) form.append("height", String(dims.height));
  const res = await xhrSend("POST", presign.postUrl, form, {}, opts.onProgress);
  const data = JSON.parse(res.text || "{}");
  if (res.status < 200 || res.status >= 300) {
    throw new Error(data.message ?? data.error ?? `local upload ${res.status}`);
  }
  return data.asset as Asset;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/upload-client.ts
git commit -m "feat(assets): shared client uploader (presign→PUT/POST→commit)"
```

---

## Task 11: Asset Library page + component

**Files:**
- Create: `src/app/admin/assets/page.tsx`
- Create: `src/components/admin/asset-library.tsx`
- Modify: `src/app/admin/layout.tsx` (nav link)

- [ ] **Step 1: Server page**

Create `src/app/admin/assets/page.tsx`:
```tsx
import { requireAdmin } from "@/lib/dal";
import { repo, assetRepo } from "@/lib/store";
import { computeAssetUsage } from "@/lib/asset-usage";
import AssetLibrary from "@/components/admin/asset-library";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  await requireAdmin();
  const [assets, properties] = await Promise.all([
    assetRepo.list(),
    repo.list(),
  ]);
  const usage = computeAssetUsage(properties, assets);
  return (
    <div className="p-6">
      <h1 className="text-xl font-serif mb-1">アセットライブラリ</h1>
      <p className="text-muted text-[13px] mb-5">
        画像・3DGS を物件と切り離して管理します。物件編集では「ライブラリから選択」で紐付け。
      </p>
      <AssetLibrary initialAssets={assets} usage={usage} />
    </div>
  );
}
```

- [ ] **Step 2: Client library component**

Create `src/components/admin/asset-library.tsx`:
```tsx
"use client";

import { useMemo, useRef, useState } from "react";
import type { Asset, AssetKind } from "@/lib/schemas";
import { uploadAsset } from "./upload-client";
import { renameAssetAction, deleteAssetAction } from "@/app/admin/_actions";

interface Props {
  initialAssets: Asset[];
  usage: Record<string, string[]>;
}

function fmtBytes(n: number) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function AssetLibrary({ initialAssets, usage }: Props) {
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | AssetKind>("all");
  const [onlyUnused, setOnlyUnused] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      if (kindFilter !== "all" && a.kind !== kindFilter) return false;
      if (onlyUnused && (usage[a.url]?.length ?? 0) > 0) return false;
      if (q && !`${a.label} ${a.filename}`.toLowerCase().includes(q.toLowerCase()))
        return false;
      return true;
    });
  }, [assets, kindFilter, onlyUnused, q, usage]);

  async function handleFiles(list: FileList | File[]) {
    setError(null);
    for (const file of Array.from(list)) {
      const kind: AssetKind = file.type.startsWith("image/") ? "image" : "splat";
      const tmpKey = `${file.name}-${file.size}`;
      setProgress((p) => ({ ...p, [tmpKey]: 0 }));
      try {
        const asset = await uploadAsset(file, kind, {
          onProgress: (pct) => setProgress((p) => ({ ...p, [tmpKey]: pct })),
        });
        setAssets((prev) => [asset, ...prev]);
      } catch (e) {
        setError(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setProgress((p) => {
          const { [tmpKey]: _drop, ...rest } = p;
          return rest;
        });
      }
    }
  }

  async function onRename(a: Asset) {
    const label = prompt("表示名", a.label);
    if (label == null) return;
    const res = await renameAssetAction(a.id, label);
    if (res.ok) setAssets((prev) => prev.map((x) => (x.id === a.id ? { ...x, label } : x)));
  }

  async function onDelete(a: Asset) {
    const inUse = usage[a.url]?.length ?? 0;
    const msg = inUse
      ? `このアセットは ${inUse} 件の物件で使用中です。削除すると表示が壊れます。削除しますか？`
      : "削除しますか？（R2 のファイルも削除されます）";
    if (!confirm(msg)) return;
    const res = await deleteAssetAction(a.id);
    if (res.ok) setAssets((prev) => prev.filter((x) => x.id !== a.id));
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <button
          onClick={() => fileRef.current?.click()}
          className="bg-accent text-black px-3 py-1.5 text-[13px] font-medium"
        >
          ＋ アップロード
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          multiple
          accept="image/*,.splat,.ply,.ksplat"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="検索（名前）"
          className="bg-[#222] border border-line px-2 py-1 text-[13px]"
        />
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as "all" | AssetKind)}
          className="bg-[#222] border border-line px-2 py-1 text-[13px]"
        >
          <option value="all">すべて</option>
          <option value="image">画像</option>
          <option value="splat">3DGS</option>
        </select>
        <label className="text-[12px] text-muted flex items-center gap-1">
          <input type="checkbox" checked={onlyUnused} onChange={(e) => setOnlyUnused(e.target.checked)} />
          未使用のみ
        </label>
      </div>

      {error && <div className="text-accent text-[12px] mb-3">{error}</div>}
      {Object.entries(progress).map(([k, pct]) => (
        <div key={k} className="mono text-[11px] text-muted mb-1">
          {k} … {pct}%
        </div>
      ))}

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {filtered.map((a) => {
          const used = usage[a.url]?.length ?? 0;
          return (
            <div key={a.id} className="border border-line bg-[#1d1d1d]">
              <div className="aspect-video bg-[#111] flex items-center justify-center overflow-hidden">
                {a.kind === "image" && a.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.label} className="object-cover w-full h-full" />
                ) : (
                  <span className="mono text-[28px] opacity-50">◈</span>
                )}
              </div>
              <div className="p-2 text-[12px]">
                <div className="truncate" title={a.label}>{a.label || a.filename}</div>
                <div className="mono text-[10px] text-muted mt-0.5">
                  {a.kind} · {fmtBytes(a.size)} {used > 0 ? `· 使用 ${used}` : "· 未使用"}
                </div>
                <div className="flex gap-2 mt-1.5">
                  <button onClick={() => onRename(a)} className="text-[11px] underline opacity-70 hover:opacity-100">名前</button>
                  <button onClick={() => onDelete(a)} className="text-[11px] underline text-accent">削除</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && (
        <div className="text-muted text-[13px] py-10 text-center">アセットがありません。</div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add the admin nav link**

In `src/app/admin/layout.tsx`, find the sidebar nav links (e.g. the list containing `/admin/properties` and `/admin/accounts`) and add an entry:
```tsx
<a href="/admin/assets" className="block px-3 py-2 hover:bg-[#222]">アセット</a>
```
Match the exact className/markup of the sibling links already there (read the file first; mirror their style).

- [ ] **Step 4: Verify on the dev server (local mode)**

Run: `npm run dev` then open `http://localhost:3000/admin/assets`
(If admin auth blocks you in dev, set `NEXT_PUBLIC_ADMIN_BYPASS=1` in `.env.local` per existing convention, or sign in as the bootstrap admin.)
Expected: page renders; "＋ アップロード" lets you pick an image; after upload it appears in the grid with a thumbnail; `data/assets.json` gains an entry with `status:"ready"` and a `/uploads/...` url; the file exists under `public/uploads/`.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/assets/page.tsx src/components/admin/asset-library.tsx src/app/admin/layout.tsx
git commit -m "feat(assets): admin asset library page + nav"
```

---

## Task 12: Asset picker modal + property-editor integration

**Files:**
- Create: `src/components/admin/asset-picker-modal.tsx`
- Modify: `src/components/admin/property-editor.tsx`

- [ ] **Step 1: Picker modal**

Create `src/components/admin/asset-picker-modal.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import type { Asset, AssetKind } from "@/lib/schemas";

interface Props {
  kind: AssetKind;
  open: boolean;
  onClose: () => void;
  onPick: (asset: Asset) => void;
}

export default function AssetPickerModal({ kind, open, onClose, onPick }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/admin/assets?kind=${kind}`)
      .then((r) => r.json())
      .then((d) => setAssets(d.assets ?? []))
      .finally(() => setLoading(false));
  }, [open, kind]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1a1a1a] border border-line max-w-3xl w-full max-h-[80vh] overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-[15px]">ライブラリから選択（{kind === "image" ? "画像" : "3DGS"}）</h2>
          <button onClick={onClose} className="text-muted hover:text-ink">✕</button>
        </div>
        {loading ? (
          <div className="text-muted text-[13px] py-8 text-center">読み込み中…</div>
        ) : assets.length === 0 ? (
          <div className="text-muted text-[13px] py-8 text-center">
            アセットがありません。<a href="/admin/assets" className="text-accent underline">ライブラリ</a>でアップロードしてください。
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {assets.map((a) => (
              <button
                key={a.id}
                onClick={() => { onPick(a); onClose(); }}
                className="border border-line bg-[#1d1d1d] text-left hover:border-accent"
              >
                <div className="aspect-video bg-[#111] flex items-center justify-center overflow-hidden">
                  {a.kind === "image" && a.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.url} alt={a.label} className="object-cover w-full h-full" />
                  ) : (
                    <span className="mono text-[24px] opacity-50">◈</span>
                  )}
                </div>
                <div className="p-2 text-[12px] truncate">{a.label || a.filename}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the picker into the editor**

Read `src/components/admin/property-editor.tsx` first to locate the photo step (cover/gallery) and the 3DGS step (splatUrl), and the react-hook-form `setValue`/`getValues`/`watch` already in use.

Add the import near the top:
```tsx
import AssetPickerModal from "./asset-picker-modal";
import type { Asset } from "@/lib/schemas";
```
Add state inside the component (near other `useState`):
```tsx
const [pickImageFor, setPickImageFor] = useState<null | "cover" | "gallery">(null);
const [pickSplat, setPickSplat] = useState(false);
```
In the **photo step** JSX, add two buttons (next to the existing FileDropzone), using the form's `setValue`/`getValues`:
```tsx
<div className="flex gap-2 mb-2">
  <button type="button" onClick={() => setPickImageFor("cover")} className="text-[12px] border border-line px-2 py-1 hover:border-accent">
    ライブラリからカバーを選択
  </button>
  <button type="button" onClick={() => setPickImageFor("gallery")} className="text-[12px] border border-line px-2 py-1 hover:border-accent">
    ライブラリからギャラリーに追加
  </button>
</div>
<AssetPickerModal
  kind="image"
  open={pickImageFor !== null}
  onClose={() => setPickImageFor(null)}
  onPick={(a: Asset) => {
    if (pickImageFor === "cover") {
      setValue("cover.src", a.url, { shouldDirty: true });
      setValue("cover.alt", a.label, { shouldDirty: true });
      if (a.width) setValue("cover.width", a.width);
      if (a.height) setValue("cover.height", a.height);
    } else if (pickImageFor === "gallery") {
      const cur = getValues("gallery") ?? [];
      setValue("gallery", [...cur, { src: a.url, alt: a.label, width: a.width ?? 1600, height: a.height ?? 1000 }], { shouldDirty: true });
    }
  }}
/>
```
In the **3DGS step** JSX, add:
```tsx
<button type="button" onClick={() => setPickSplat(true)} className="text-[12px] border border-line px-2 py-1 hover:border-accent mb-2">
  ライブラリから3DGSを選択
</button>
<AssetPickerModal
  kind="splat"
  open={pickSplat}
  onClose={() => setPickSplat(false)}
  onPick={(a: Asset) => {
    setValue("splatUrl", a.url, { shouldDirty: true });
    setValue("splatSizeMb", Math.round(a.size / 1024 / 1024), { shouldDirty: true });
  }}
/>
```
(Use the editor's actual `setValue`/`getValues` from its existing `useForm` instance — names already in scope.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (If `setValue` field-path strings error under RHF generics, confirm they match the property schema paths exactly: `cover.src`, `cover.alt`, `cover.width`, `cover.height`, `gallery`, `splatUrl`, `splatSizeMb`.)

- [ ] **Step 4: Verify on the dev server**

Run: `npm run dev`, open a property in `/admin/properties/[id]/edit`.
Expected: photo step shows the two "ライブラリから…" buttons → clicking opens the modal listing your uploaded images → picking sets the cover preview/URL; 3DGS step pick sets `splatUrl`. Save draft (⌘S) → reopen → values persist.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/asset-picker-modal.tsx src/components/admin/property-editor.tsx
git commit -m "feat(assets): library picker wired into property editor"
```

---

## Task 13: Unify inline FileDropzone onto the asset index

**Files:**
- Modify: `src/components/admin/file-dropzone.tsx`

- [ ] **Step 1: Switch the dropzone to the shared uploader**

In `src/components/admin/file-dropzone.tsx`, replace the `uploadOne` implementation (the XHR-to-`/api/admin/upload` block) so it calls `uploadAsset()` and still reports progress + calls `onUploaded`. Add the import:
```tsx
import { uploadAsset } from "./upload-client";
```
Replace the body of `uploadOne` with:
```tsx
const uploadOne = useCallback(
  (file: File) => {
    const localId = `${file.name}-${file.size}-${Date.now()}`;
    setInFlight((prev) => [
      ...prev,
      { id: localId, name: file.name, size: file.size, progress: 0 },
    ]);
    uploadAsset(file, kind, {
      onProgress: (pct) =>
        setInFlight((prev) =>
          prev.map((f) => (f.id === localId ? { ...f, progress: pct } : f)),
        ),
    })
      .then((asset) => {
        onUploaded(
          { url: asset.url, size: asset.size, contentType: asset.contentType },
          file.name,
        );
        setInFlight((prev) => prev.filter((f) => f.id !== localId));
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        setInFlight((prev) =>
          prev.map((f) => (f.id === localId ? { ...f, error: msg } : f)),
        );
      });
  },
  [kind, onUploaded],
);
```
(`propertyId` is no longer needed by `uploadOne`; leave the prop for API compatibility — assets are bucketed by their own id now.)

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. Remove the now-unused `propertyId` from `uploadOne`'s dependency array (done above); if lint flags `propertyId` unused in the component, keep the prop (it's part of the public interface) — prefix usage is not required.

- [ ] **Step 3: Verify**

Run `npm run dev`; in the editor photo step, drag an image onto the existing dropzone.
Expected: it uploads via the new flow, appears in `data/assets.json`, and the cover/gallery field is set — i.e. inline uploads now also show up in `/admin/assets`.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/file-dropzone.tsx
git commit -m "refactor(assets): inline dropzone uploads via the asset index"
```

---

## Task 14: Config — next/image hosts + env docs

**Files:**
- Modify: `next.config.ts`
- Modify: `.env.example`

- [ ] **Step 1: Allow the R2 host for next/image**

Edit `next.config.ts` to add `images.remotePatterns` (guarded so an unset env doesn't crash the build):
```ts
import type { NextConfig } from "next";

const r2Host = (() => {
  try {
    return process.env.R2_PUBLIC_URL ? new URL(process.env.R2_PUBLIC_URL).hostname : null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      ...(r2Host ? [{ protocol: "https" as const, hostname: r2Host }] : []),
      { protocol: "https" as const, hostname: "picsum.photos" },
    ],
  },
};

export default nextConfig;
```
(If the file already exports a `nextConfig`, merge the `images` key in rather than overwriting other settings.)

- [ ] **Step 2: Document env in `.env.example`**

Ensure `.env.example` contains (append any missing lines):
```
# Upload mode: "local" (public/uploads, no creds) or "r2" (presigned direct upload)
UPLOAD_MODE=local
R2_ACCOUNT_ID=9ad06a76157fb2f40dfef1f4b7a14a93
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=locahun3d-assets
R2_PUBLIC_URL=https://pub-6fe11fc6301a424ba739695a7c4d2dd9.r2.dev
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add next.config.ts .env.example
git commit -m "chore(assets): next/image R2 host + env docs"
```

---

## Task 15: Full verification pass (local mode)

**Files:** none (verification + final commit of `data/`)

- [ ] **Step 1: Unit tests + types + lint + build all green**

Run:
```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```
Expected: tests pass; no type errors; lint clean; build succeeds.

- [ ] **Step 2: End-to-end smoke (local mode, no R2 keys)**

Run `npm run dev`. With admin access (bootstrap admin or `NEXT_PUBLIC_ADMIN_BYPASS=1`):
1. `/admin/assets` → upload 2 images + (optionally) a small `.ply`. They appear with thumbnails; `data/assets.json` has `ready` entries; files under `public/uploads/`.
2. `/admin/properties` → open a draft → photo step → "ライブラリからカバーを選択" → pick → cover set. Gallery add → pick → appears. 3DGS step → pick the `.ply` → `splatUrl` set.
3. ⌘S to save → reload editor → values persist.
4. Back on `/admin/assets`, the used assets show "使用 N"; delete an unused one → it disappears and is removed from `data/assets.json`.

Confirm each expectation; if any fails, fix before continuing.

- [ ] **Step 3: Commit any seed/index changes**

```bash
git add data/assets.json
git commit -m "chore(assets): commit asset index from local verification"
```
(Do NOT commit `public/uploads/` contents — they're gitignored; large/binary test files stay local.)

---

## R2 activation checklist (deferred — run when keys arrive)

Not a code task; document for when the R2 API token is provisioned:

1. Create an R2 API token (S3-compatible Access Key/Secret) scoped to **Object Read & Write** on bucket `locahun3d-assets` (Cloudflare dashboard → R2 → Manage R2 API Tokens).
2. Put the values in `.env.local`; set `UPLOAD_MODE=r2`.
3. Configure bucket CORS (dashboard or `wrangler r2 bucket cors put`):
   ```json
   [{ "AllowedOrigins": ["http://localhost:3000", "https://locahun3d.com"],
      "AllowedMethods": ["PUT", "GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"] }]
   ```
4. `npm run dev`, upload a small image in `/admin/assets`, confirm: object exists in R2, the `R2_PUBLIC_URL/...` link renders, `deleteAssetAction` removes it from R2. Then test a large `.ply`.

---

## Self-Review notes

- **Spec coverage:** Library page + upload/list/rename/delete (§4–6) → Tasks 4,9,11. R2 presign+delete (§7) → Tasks 6,7,8. Editor picker (§8) → Task 12. Local fallback (§5) → Tasks 6,7,8,10. Auth `requireAdmin` (§3) → every route/action. Config/CORS/remotePatterns (§9) → Task 14 + checklist. Usage computed (§4.2) → Task 5. Out-of-scope items (D1/resize/viewer/Clerk/Phase 2) → not included. ✔
- **Types:** `Asset`/`AssetKind`/`AssetStatus` defined in Task 3 and used consistently (store, routes, client). `uploadAsset(file, kind, opts)` signature consistent across Tasks 10/11/13. `validateUploadMeta`/`buildAssetKey` signatures consistent across Tasks 2/7. ✔
- **Placeholders:** none — every code step is complete. UI-into-existing-editor (Task 12) requires reading the 900-line file to place blocks, but the exact code to insert is given.
