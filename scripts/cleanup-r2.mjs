#!/usr/bin/env node
import { readFileSync } from "fs";
import { join } from "path";

const configPath = join(process.env.APPDATA, "xdg.config", ".wrangler", "config", "default.toml");
const config = readFileSync(configPath, "utf8");
const tokenMatch = config.match(/oauth_token\s*=\s*"([^"]+)"/);
if (!tokenMatch) { console.error("No oauth_token found"); process.exit(1); }
const token = tokenMatch[1];

const ACCOUNT_ID = "9ad06a76157fb2f40dfef1f4b7a14a93";
const BUCKET = "locahun3d-assets";

// Keep these files
const KEEP = new Set([
  "uploads/wh-002/Kousaten_ForDemo_point_cloud.rad",
  "uploads/wh-002/w58_0n-preview.mp4",
  "uploads/wh-002/WNGEDT-preview.mp4",
]);

// List all objects
const listUrl = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects?prefix=uploads/wh-002/`;
const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
const listData = await listRes.json();
if (!listData.success) { console.error("List failed:", listData.errors); process.exit(1); }

const toDelete = listData.result.filter(obj => !KEEP.has(obj.key));
console.log(`Found ${listData.result.length} objects, keeping ${KEEP.size}, deleting ${toDelete.length}:`);
for (const obj of toDelete) {
  console.log(`  DEL: ${obj.key} (${obj.size} bytes)`);
}

// Delete each
for (const obj of toDelete) {
  const delUrl = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects/${encodeURIComponent(obj.key)}`;
  const delRes = await fetch(delUrl, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  if (delRes.ok) {
    console.log(`  OK: ${obj.key}`);
  } else {
    console.error(`  FAIL: ${obj.key} - ${delRes.status} ${delRes.statusText}`);
  }
}
console.log("Cleanup done.");
