/**
 * Upload a large file to R2 via the deployed Worker's PUT /api/r2/ endpoint.
 * Usage: node scripts/upload-via-api.mjs <local-file-path> <r2-key>
 * Example: node scripts/upload-via-api.mjs public/uploads/wh-002/file.rad uploads/wh-002/file.rad
 */
import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";

const BASE = "https://locahun3d.com";

const filePath = process.argv[2];
const key = process.argv[3];

if (!filePath || !key) {
  console.error("Usage: node scripts/upload-via-api.mjs <file> <key>");
  process.exit(1);
}

const stat = statSync(filePath);
console.log(`Uploading ${filePath} (${(stat.size / 1024 / 1024).toFixed(1)} MB) -> ${BASE}/api/r2/${key}`);

const stream = createReadStream(filePath);
const webStream = Readable.toWeb(stream);

const resp = await fetch(`${BASE}/api/r2/${key}`, {
  method: "PUT",
  headers: {
    "Content-Type": "application/octet-stream",
    "Content-Length": String(stat.size),
  },
  body: webStream,
  duplex: "half",
});

console.log(`Status: ${resp.status} ${resp.statusText}`);
const text = await resp.text();
console.log("Response:", text.slice(0, 500));

if (!resp.ok) process.exit(1);
