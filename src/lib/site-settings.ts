/**
 * Site settings store — single JSON document (`data/site-settings.json`).
 * Holds operator-level config such as the 限定無料期間. Migrates to D1 later.
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  siteSettingsSchema,
  DEFAULT_SETTINGS,
  type SiteSettings,
} from "./settings-schema";

const DATA_FILE = path.join(process.cwd(), "data", "site-settings.json");

export async function getSettings(): Promise<SiteSettings> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return siteSettingsSchema.parse(JSON.parse(raw));
  } catch {
    // Missing file or invalid JSON → fall back to defaults (no campaign).
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: SiteSettings): Promise<SiteSettings> {
  const validated = siteSettingsSchema.parse(s);
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(validated, null, 2), "utf8");
  return validated;
}
