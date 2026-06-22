/**
 * Upload a large file to R2 via Cloudflare API using wrangler's stored OAuth token.
 * Usage: node scripts/upload-r2.mjs <local-file-path> <r2-object-key>
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const ACCOUNT_ID = "9ad06a76157fb2f40dfef1f4b7a14a93";
const BUCKET = "locahun3d-assets";

// Read wrangler OAuth token
const configPath = join(
  process.env.APPDATA || join(homedir(), ".config"),
  "xdg.config",
  ".wrangler",
  "config",
  "default.toml"
);
const configText = readFileSync(configPath, "utf8");
const tokenMatch = configText.match(/oauth_token\s*=\s*"([^"]+)"/);
if (!tokenMatch) {
  console.error("Cannot find wrangler OAuth token");
  process.exit(1);
}
const token = tokenMatch[1];

const filePath = process.argv[2];
const objectKey = process.argv[3];

if (!filePath || !objectKey) {
  console.error("Usage: node scripts/upload-r2.mjs <file> <key>");
  process.exit(1);
}

console.log(`Uploading ${filePath} -> r2://${BUCKET}/${objectKey}`);

const fileData = readFileSync(filePath);
console.log(`File size: ${(fileData.byteLength / 1024 / 1024).toFixed(1)} MB`);

const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects/${encodeURIComponent(objectKey)}`;

const resp = await fetch(url, {
  method: "PUT",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/octet-stream",
  },
  body: fileData,
  duplex: "half",
});

console.log(`Status: ${resp.status} ${resp.statusText}`);
const text = await resp.text();
try {
  const result = JSON.parse(text);
  if (result.success) {
    console.log("Upload successful!");
  } else {
    console.error("Upload failed:", JSON.stringify(result.errors, null, 2));
    process.exit(1);
  }
} catch {
  console.error("Non-JSON response:", text.slice(0, 500));
  process.exit(1);
}
