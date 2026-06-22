/**
 * Upload a large file to R2 via multipart upload through the Worker API.
 * Usage: node scripts/upload-chunked.mjs <local-file-path> <r2-key>
 */
import { readFileSync, statSync } from "node:fs";

const BASE = process.argv[4] || "https://locahun3d.com";
const CHUNK_SIZE = 50 * 1024 * 1024; // 50 MB per part

const filePath = process.argv[2];
const key = process.argv[3];

if (!filePath || !key) {
  console.error("Usage: node scripts/upload-chunked.mjs <file> <key> [base-url]");
  process.exit(1);
}

const stat = statSync(filePath);
const totalParts = Math.ceil(stat.size / CHUNK_SIZE);
console.log(`File: ${filePath} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
console.log(`Uploading to: ${BASE}/api/r2-multipart as ${key}`);
console.log(`Parts: ${totalParts} × ${CHUNK_SIZE / 1024 / 1024} MB\n`);

// Read entire file into memory
const fileData = readFileSync(filePath);

// 1. Init multipart upload
console.log("Initiating multipart upload...");
const initResp = await fetch(`${BASE}/api/r2-multipart`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "init", key }),
});
if (!initResp.ok) {
  console.error("Init failed:", initResp.status, await initResp.text());
  process.exit(1);
}
const { uploadId } = await initResp.json();
console.log(`Upload ID: ${uploadId}\n`);

// 2. Upload parts
const parts = [];
for (let i = 0; i < totalParts; i++) {
  const start = i * CHUNK_SIZE;
  const end = Math.min(start + CHUNK_SIZE, stat.size);
  const chunk = fileData.subarray(start, end);
  const partNumber = i + 1;

  process.stdout.write(`Part ${partNumber}/${totalParts} (${(chunk.byteLength / 1024 / 1024).toFixed(1)} MB)... `);

  const partResp = await fetch(
    `${BASE}/api/r2-multipart?key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: chunk,
      duplex: "half",
    },
  );

  if (!partResp.ok) {
    console.error(`\nPart ${partNumber} failed:`, partResp.status, await partResp.text());
    process.exit(1);
  }

  const partResult = await partResp.json();
  parts.push(partResult);
  console.log(`OK (etag: ${partResult.etag})`);
}

// 3. Complete
console.log("\nCompleting multipart upload...");
const completeResp = await fetch(`${BASE}/api/r2-multipart`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "complete", key, uploadId, parts }),
});

if (!completeResp.ok) {
  console.error("Complete failed:", completeResp.status, await completeResp.text());
  process.exit(1);
}

const result = await completeResp.json();
console.log(`\nUpload complete! Key: ${result.key}, Size: ${result.size}`);
