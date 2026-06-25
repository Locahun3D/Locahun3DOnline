/**
 * Property repository — dev impl writes a JSON file in the repo (`data/properties.json`).
 *
 * Migration plan: swap to D1 by implementing the same interface with `c.env.DB.prepare(...)`.
 * The repo file is committed to git as the source of truth during the JSON-CMS phase,
 * so editor changes ship via `git push`.
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import {
  getR2Bucket,
  r2ColPut,
  r2ColGet,
  r2ColDelete,
  r2ColList,
  r2DocGet,
  r2DocPut,
} from "./r2-store";
import {
  propertySchema,
  assetSchema,
  type Property,
  type PropertyStatus,
  type Asset,
  type AssetKind,
  type AssetStatus,
} from "./schemas";
// Bundled at build-time; used as read-only fallback on Cloudflare Workers
// where node:fs is stubbed out by unenv.
import _propsFallback from "../../data/properties.json";
import _assetsFallback from "../../data/assets.json";

const DATA_FILE = path.join(process.cwd(), "data", "properties.json");

export interface PropertyRepo {
  list(opts?: { status?: PropertyStatus }): Promise<Property[]>;
  get(id: string): Promise<Property | null>;
  upsert(p: Property): Promise<Property>;
  remove(id: string): Promise<void>;
}

interface StoreShape {
  version: 1;
  properties: Property[];
}

async function readStore(): Promise<StoreShape> {
  if (!canAccessLocalFs()) return _propsFallback as unknown as StoreShape;
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(raw) as StoreShape;
  } catch {
    return _propsFallback as unknown as StoreShape;
  }
}

async function writeStore(s: StoreShape): Promise<void> {
  await safeWriteFile(DATA_FILE, JSON.stringify(s, null, 2));
}

/**
 * 物件リポジトリ。
 *  - dev（書込可FS）: data/properties.json を読み書き。
 *  - Workers（書込不可FS）: R2 コレクション（`_properties/<id>.json`）。
 *    本番の管理画面から直接編集・保存→即反映できる（旧: git SOT で本番保存不可だった）。
 * 初回のみバンドルの data/properties.json を R2 へシードして既存物件を保護する。
 */
const PROP_R2_PREFIX = "_properties/";
const PROP_SEED_KEY = "_properties_seeded.json";
let _propsSeeded = false;

async function ensurePropsSeeded(): Promise<void> {
  if (_propsSeeded) return;
  const marker = await r2DocGet<{ seeded: boolean }>(PROP_SEED_KEY);
  if (marker?.seeded) {
    _propsSeeded = true;
    return;
  }
  const seed = (_propsFallback as unknown as StoreShape).properties ?? [];
  for (const p of seed) {
    await r2ColPut(PROP_R2_PREFIX, p.id, p);
  }
  await r2DocPut(PROP_SEED_KEY, { seeded: true });
  _propsSeeded = true;
}

/**
 * 読込時にスキーマで検証し、欠落フィールドに default を補完する。
 * upsert 時しか検証していなかったため、seed や旧 R2 レコードが欠落フィールドを
 * 持つと公開ページ側で property.cover.src 等が undefined 参照でクラッシュし得た。
 * 検証成功 → default 補完済みの安全なオブジェクト、失敗 → null（リストでは除外）。
 */
function coerceProperty(raw: unknown): Property | null {
  const r = propertySchema.safeParse(raw);
  if (r.success) return r.data;
  const id = (raw as { id?: unknown })?.id;
  console.error("[store] invalid property record skipped:", id, r.error.issues);
  return null;
}

class PropertyRepoImpl implements PropertyRepo {
  async list(opts: { status?: PropertyStatus } = {}): Promise<Property[]> {
    let raw: unknown[];
    if (canAccessLocalFs()) {
      raw = (await readStore()).properties;
    } else {
      await ensurePropsSeeded();
      raw = await r2ColList<Property>(PROP_R2_PREFIX);
    }
    const props = raw
      .map(coerceProperty)
      .filter((p): p is Property => p !== null);
    const out = opts.status
      ? props.filter((p) => p.status === opts.status)
      : props;
    return out.sort((a, b) =>
      (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
    );
  }

  async get(id: string): Promise<Property | null> {
    let raw: unknown;
    if (canAccessLocalFs()) {
      raw = (await readStore()).properties.find(
        (p) => (p as Property).id === id,
      );
    } else {
      await ensurePropsSeeded();
      raw = await r2ColGet<Property>(PROP_R2_PREFIX, id);
    }
    if (!raw) return null;
    return coerceProperty(raw);
  }

  async upsert(p: Property): Promise<Property> {
    const validated = propertySchema.parse({
      ...p,
      updatedAt: new Date().toISOString(),
      createdAt: p.createdAt ?? new Date().toISOString(),
    });
    if (canAccessLocalFs()) {
      const s = await readStore();
      const idx = s.properties.findIndex((x) => x.id === validated.id);
      if (idx >= 0) s.properties[idx] = validated;
      else s.properties.push(validated);
      await writeStore(s);
    } else {
      await ensurePropsSeeded();
      await r2ColPut(PROP_R2_PREFIX, validated.id, validated);
    }
    return validated;
  }

  async remove(id: string): Promise<void> {
    if (canAccessLocalFs()) {
      const s = await readStore();
      s.properties = s.properties.filter((p) => p.id !== id);
      await writeStore(s);
    } else {
      await ensurePropsSeeded();
      await r2ColDelete(PROP_R2_PREFIX, id);
    }
  }
}

export const repo: PropertyRepo = new PropertyRepoImpl();

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

/**
 * アセットのメタデータ保存。
 *  - dev（書込可FS）: data/assets.json を読み書き。
 *  - Workers（書込不可FS）: R2 のコレクション（`_assets/<id>.json`）に永続化。
 * 旧実装は safeWriteFile が Workers で no-op だったため、アップロード/削除が
 * 永続化されず「削除しても消えない」状態だった（本修正で解消）。
 */
const ASSET_R2_PREFIX = "_assets/";

export class AssetRepoImpl implements AssetRepo {
  constructor(private readonly dataFile: string = ASSETS_FILE) {}

  private async readFile(): Promise<AssetStoreShape> {
    try {
      const raw = await fs.readFile(this.dataFile, "utf8");
      return JSON.parse(raw) as AssetStoreShape;
    } catch {
      return _assetsFallback as unknown as AssetStoreShape;
    }
  }

  private async writeFile(s: AssetStoreShape): Promise<void> {
    await safeWriteFile(this.dataFile, JSON.stringify(s, null, 2));
  }

  async list(
    opts: { kind?: AssetKind; status?: AssetStatus } = {},
  ): Promise<Asset[]> {
    let out: Asset[];
    if (canAccessLocalFs()) {
      out = (await this.readFile()).assets;
    } else {
      out = await r2ColList<Asset>(ASSET_R2_PREFIX);
    }
    if (opts.kind) out = out.filter((a) => a.kind === opts.kind);
    if (opts.status) out = out.filter((a) => a.status === opts.status);
    return [...out].sort((a, b) =>
      (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? ""),
    );
  }

  async get(id: string): Promise<Asset | null> {
    if (canAccessLocalFs()) {
      return (await this.readFile()).assets.find((a) => a.id === id) ?? null;
    }
    return r2ColGet<Asset>(ASSET_R2_PREFIX, id);
  }

  async upsert(a: Asset): Promise<Asset> {
    const validated = assetSchema.parse(a);
    if (canAccessLocalFs()) {
      const s = await this.readFile();
      const idx = s.assets.findIndex((x) => x.id === validated.id);
      if (idx >= 0) s.assets[idx] = validated;
      else s.assets.push(validated);
      await this.writeFile(s);
    } else {
      await r2ColPut(ASSET_R2_PREFIX, validated.id, validated);
    }
    return validated;
  }

  async remove(id: string): Promise<void> {
    // 実体ファイル（R2 blob）も削除してストレージを解放する。
    const a = await this.get(id);
    if (a?.r2Key) {
      try {
        const bucket = await getR2Bucket();
        if (bucket) await bucket.delete(a.r2Key);
      } catch {
        /* blob 削除失敗はメタ削除を妨げない */
      }
    }
    if (canAccessLocalFs()) {
      const s = await this.readFile();
      s.assets = s.assets.filter((x) => x.id !== id);
      await this.writeFile(s);
    } else {
      await r2ColDelete(ASSET_R2_PREFIX, id);
    }
  }
}

export const assetRepo: AssetRepo = new AssetRepoImpl();
