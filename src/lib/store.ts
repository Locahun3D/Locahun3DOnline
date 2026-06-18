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
import {
  propertySchema,
  assetSchema,
  type Property,
  type PropertyStatus,
  type Asset,
  type AssetKind,
  type AssetStatus,
} from "./schemas";

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
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as StoreShape;
    return parsed;
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "ENOENT"
    ) {
      return { version: 1, properties: [] };
    }
    throw e;
  }
}

async function writeStore(s: StoreShape): Promise<void> {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(s, null, 2), "utf8");
}

class JsonFilePropertyRepo implements PropertyRepo {
  async list(opts: { status?: PropertyStatus } = {}): Promise<Property[]> {
    const s = await readStore();
    const out = opts.status
      ? s.properties.filter((p) => p.status === opts.status)
      : s.properties;
    return out.sort((a, b) =>
      (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
    );
  }

  async get(id: string): Promise<Property | null> {
    const s = await readStore();
    return s.properties.find((p) => p.id === id) ?? null;
  }

  async upsert(p: Property): Promise<Property> {
    const validated = propertySchema.parse({
      ...p,
      updatedAt: new Date().toISOString(),
      createdAt: p.createdAt ?? new Date().toISOString(),
    });
    const s = await readStore();
    const idx = s.properties.findIndex((x) => x.id === validated.id);
    if (idx >= 0) s.properties[idx] = validated;
    else s.properties.push(validated);
    await writeStore(s);
    return validated;
  }

  async remove(id: string): Promise<void> {
    const s = await readStore();
    s.properties = s.properties.filter((p) => p.id !== id);
    await writeStore(s);
  }
}

export const repo: PropertyRepo = new JsonFilePropertyRepo();

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
