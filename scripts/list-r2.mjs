#!/usr/bin/env node
// Temporary script to list R2 objects. Uses wrangler's saved OAuth token.
import { readFileSync } from "fs";
import { join } from "path";

const configPath = join(process.env.APPDATA, "xdg.config", ".wrangler", "config", "default.toml");
const config = readFileSync(configPath, "utf8");
const tokenMatch = config.match(/oauth_token\s*=\s*"([^"]+)"/);
if (!tokenMatch) { console.error("No oauth_token found"); process.exit(1); }
const token = tokenMatch[1];

const ACCOUNT_ID = "9ad06a76157fb2f40dfef1f4b7a14a93";
const BUCKET = "locahun3d-assets";
const PREFIX = "uploads/";

const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects?prefix=${encodeURIComponent(PREFIX)}`;
const res = await fetch(url, {
  headers: { Authorization: `Bearer ${token}` },
});
const data = await res.json();
if (!data.success) {
  console.error("API error:", JSON.stringify(data.errors));
  process.exit(1);
}
console.log("Full response:", JSON.stringify(data, null, 2).slice(0, 3000));
