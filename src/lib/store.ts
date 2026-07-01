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
import { getR2Bucket, r2ColList } from "./r2-store";
import {
  getD1,
  d1GetData,
  d1ListData,
  d1Upsert,
  d1Delete,
  d1IsEmpty,
  type D1,
} from "./d1";
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
const PROP_TABLE = "properties";
const PROP_R2_PREFIX = "_properties/"; // 旧本番ストア（D1 への初回シード元）

/** D1 の実カラム抽出（id 含む）。properties は id のみが UNIQUE。 */
function propertyCols(p: Property): Record<string, string | number | null> {
  return {
    id: p.id,
    status: p.status ?? null,
    visibility: p.visibility ?? null,
    category: p.category ?? null,
    owner_id: p.ownerId ?? null,
    created_at: p.createdAt ?? null,
    updated_at: p.updatedAt ?? null,
  };
}

// D1 が空なら「旧本番(R2 _properties/*) → 無ければ git seed」を非破壊で初回投入。
let _propsSeeded = false;
async function ensurePropsSeeded(db: D1): Promise<void> {
  if (_propsSeeded) return;
  if (!(await d1IsEmpty(db, PROP_TABLE))) {
    _propsSeeded = true;
    return;
  }
  const r2 = await r2ColList<Property>(PROP_R2_PREFIX).catch(() => [] as Property[]);
  const src = r2.length
    ? r2
    : (_propsFallback as unknown as StoreShape).properties ?? [];
  for (const raw of src) {
    const p = coerceProperty(raw);
    if (p) await d1Upsert(db, PROP_TABLE, "id", propertyCols(p), p);
  }
  _propsSeeded = true;
}

/**
 * 読込時にスキーマで検証し、欠落フィールドに default を補完する。
 * upsert 時しか検証していなかったため、seed や旧 R2 レコードが欠落フィールドを
 * 持つと公開ページ側で property.cover.src 等が undefined 参照でクラッシュし得た。
 * 検証成功 → default 補完済みの安全なオブジェクト、失敗 → null（リストでは除外）。
 */
function coerceProperty(
  raw: unknown,
  { lenient = false }: { lenient?: boolean } = {},
): Property | null {
  const r = propertySchema.safeParse(raw);
  if (r.success) return r.data;
  const id = (raw as { id?: unknown })?.id;
  console.error("[store] invalid property record:", id, r.error.issues);
  if (!lenient) return null;

  // Salvage (get() のみ): 1フィールドの型崩れで「レコードごと消える」と、編集者が
  // 開いて直すことすらできなくなる。デフォルト充填済みの骨組みに、単体で検証を
  // 通る各フィールドだけ上書きし、壊れたフィールドは default に落として返す。
  // これで編集ページは必ず開け、保存し直せば正常化する。
  try {
    // 骨組みには propertySchema の「必須・default 無し」フィールド（category, cover）を
    // 明示的に与える。これが無いと parse 自体が throw して salvage が一切走らない。
    // 実レコードの category/cover が正しければ下の probe ループで上書き復元される。
    const skeleton = propertySchema.parse({
      id: typeof id === "string" && id ? id : "unknown",
      category: "studio",
      cover: {},
    }) as Record<string, unknown>;
    if (raw && typeof raw === "object") {
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (!(k in skeleton)) continue; // スキーマ外のキーは無視（undefined混入防止）
        const probe = propertySchema.safeParse({ ...skeleton, [k]: v });
        if (probe.success) {
          skeleton[k] = (probe.data as Record<string, unknown>)[k];
        }
      }
    }
    return skeleton as unknown as Property;
  } catch {
    return null;
  }
}

class PropertyRepoImpl implements PropertyRepo {
  async list(opts: { status?: PropertyStatus } = {}): Promise<Property[]> {
    let raw: unknown[];
    if (canAccessLocalFs()) {
      raw = (await readStore()).properties;
    } else {
      const db = await getD1();
      if (!db) return [];
      await ensurePropsSeeded(db);
      raw = await d1ListData<unknown>(db, PROP_TABLE);
    }
    const props = raw
      .map((r) => coerceProperty(r))
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
      const db = await getD1();
      if (!db) return null;
      await ensurePropsSeeded(db);
      raw = await d1GetData<unknown>(db, PROP_TABLE, "id", id);
    }
    if (!raw) return null;
    // get() は編集経路でも使うため lenient: 型崩れでも開いて直せるよう salvage。
    return coerceProperty(raw, { lenient: true });
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
      const db = await getD1();
      if (!db) throw new Error("D1 が利用できません");
      await ensurePropsSeeded(db);
      await d1Upsert(db, PROP_TABLE, "id", propertyCols(validated), validated);
    }
    return validated;
  }

  async remove(id: string): Promise<void> {
    if (canAccessLocalFs()) {
      const s = await readStore();
      s.properties = s.properties.filter((p) => p.id !== id);
      await writeStore(s);
    } else {
      const db = await getD1();
      if (db) await d1Delete(db, PROP_TABLE, "id", id);
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
const ASSET_TABLE = "assets";
const ASSET_R2_PREFIX = "_assets/"; // 旧本番ストア（D1 への初回シード元）

function assetCols(a: Asset): Record<string, string | number | null> {
  return {
    id: a.id,
    kind: a.kind ?? null,
    status: a.status ?? null,
    uploaded_at: a.uploadedAt ?? null,
  };
}

let _assetsSeeded = false;
async function ensureAssetsSeeded(db: D1): Promise<void> {
  if (_assetsSeeded) return;
  if (!(await d1IsEmpty(db, ASSET_TABLE))) {
    _assetsSeeded = true;
    return;
  }
  const r2 = await r2ColList<Asset>(ASSET_R2_PREFIX).catch(() => [] as Asset[]);
  for (const a of r2) {
    const v = assetSchema.safeParse(a);
    if (v.success) await d1Upsert(db, ASSET_TABLE, "id", assetCols(v.data), v.data);
  }
  _assetsSeeded = true;
}

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
      const db = await getD1();
      if (!db) return [];
      await ensureAssetsSeeded(db);
      out = await d1ListData<Asset>(db, ASSET_TABLE);
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
    const db = await getD1();
    if (!db) return null;
    await ensureAssetsSeeded(db);
    return d1GetData<Asset>(db, ASSET_TABLE, "id", id);
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
      const db = await getD1();
      if (!db) throw new Error("D1 が利用できません");
      await ensureAssetsSeeded(db);
      await d1Upsert(db, ASSET_TABLE, "id", assetCols(validated), validated);
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
      const db = await getD1();
      if (db) await d1Delete(db, ASSET_TABLE, "id", id);
    }
  }
}

export const assetRepo: AssetRepo = new AssetRepoImpl();
