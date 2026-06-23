/**
 * Site settings store — single JSON document (`data/site-settings.json`).
 * Holds operator-level config such as the 限定無料期間. Migrates to D1 later.
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { safeWriteFile, canAccessLocalFs } from "./fs-safe";
import {
  siteSettingsSchema,
  DEFAULT_SETTINGS,
  type SiteSettings,
} from "./settings-schema";
import _settingsFallback from "../../data/site-settings.json";

const DATA_FILE = path.join(process.cwd(), "data", "site-settings.json");

export async function getSettings(): Promise<SiteSettings> {
  if (!canAccessLocalFs()) {
    try { return siteSettingsSchema.parse(_settingsFallback); } catch { return DEFAULT_SETTINGS; }
  }
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

export async function saveSettings(s: SiteSettings): Promise<SiteSettings> {
  const validated = siteSettingsSchema.parse(s);
  await safeWriteFile(DATA_FILE, JSON.stringify(validated, null, 2));
  return validated;
}
