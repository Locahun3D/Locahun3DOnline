/**
 * Site settings store — singleton.
 *  - dev（書込可FS）: data/site-settings.json。
 *  - deployed（Workers）: D1 テーブル `settings`（id=1 の単一行）。R2 から移行。
 * 初回は旧本番(R2 doc)またはビルド時seedを非破壊で D1 に投入する。
 */
import "server-only";
import { cache } from "react";
import { promises as fs } from "node:fs";
import path from "node:path";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import { r2DocGet } from "./r2-store";
import { getD1, type D1 } from "./d1";
import {
  siteSettingsSchema,
  DEFAULT_SETTINGS,
  type SiteSettings,
} from "./settings-schema";
import _settingsFallback from "../../data/site-settings.json";

const DATA_FILE = path.join(process.cwd(), "data", "site-settings.json");
const R2_KEY = "site-settings.json"; // 旧本番ストア（D1 への初回シード元）

async function d1GetSettings(db: D1): Promise<SiteSettings | null> {
  const row = await db.prepare("SELECT data FROM settings WHERE id = 1").first();
  if (!row) return null;
  try {
    return siteSettingsSchema.parse(JSON.parse((row as { data: string }).data));
  } catch {
    return null;
  }
}

async function d1PutSettings(db: D1, s: SiteSettings): Promise<void> {
  await db
    .prepare(
      "INSERT INTO settings (id, data) VALUES (1, ?) " +
        "ON CONFLICT(id) DO UPDATE SET data = excluded.data",
    )
    .bind(JSON.stringify(s))
    .run();
}

/** R2(operator保存) → build seed → defaults の順で確定した初期値。 */
async function seedValue(): Promise<SiteSettings> {
  const fromR2 = await r2DocGet<unknown>(R2_KEY).catch(() => null);
  try {
    return siteSettingsSchema.parse(fromR2 ?? _settingsFallback);
  } catch {
    try {
      return siteSettingsSchema.parse(_settingsFallback);
    } catch {
      return DEFAULT_SETTINGS;
    }
  }
}

export const getSettings = cache(async (): Promise<SiteSettings> => {
  if (canAccessLocalFs()) {
    try {
      const raw = await fs.readFile(DATA_FILE, "utf8");
      return siteSettingsSchema.parse(JSON.parse(raw));
    } catch {
      try {
        return siteSettingsSchema.parse(_settingsFallback);
      } catch {
        return DEFAULT_SETTINGS;
      }
    }
  }
  const db = await getD1();
  if (!db) return seedValue();
  const fromD1 = await d1GetSettings(db);
  if (fromD1) return fromD1;
  // D1 未初期化 → 旧本番/seed を非破壊で投入して返す。
  const seed = await seedValue();
  await d1PutSettings(db, seed);
  return seed;
});

export async function saveSettings(s: SiteSettings): Promise<SiteSettings> {
  const validated = siteSettingsSchema.parse(s);
  if (canAccessLocalFs()) {
    await safeWriteFile(DATA_FILE, JSON.stringify(validated, null, 2));
    return validated;
  }
  const db = await getD1();
  if (!db) throw new Error("D1 が利用できません");
  await d1PutSettings(db, validated);
  return validated;
}
