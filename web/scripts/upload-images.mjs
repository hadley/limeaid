// One-off: upload all recipe images from ../recipes-full/ to Vercel Blob.
// Usage: BLOB_READ_WRITE_TOKEN=... node scripts/upload-images.mjs [--test]
// --test uploads a single image and prints its public URL (use to confirm
// the store's base URL before hardcoding it in src/lib/images.ts).
// Resumable/idempotent: allowOverwrite makes reruns safe.
import { put, list } from "@vercel/blob";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.error("BLOB_READ_WRITE_TOKEN not set");
  process.exit(1);
}

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dir = path.join(repoRoot, "recipes-full");
const files = fs
  .readdirSync(dir)
  .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
  .sort();

const test = process.argv.includes("--test");

// Skip blobs already in the store so reruns only upload stragglers.
const existing = new Set();
if (!test) {
  let cursor;
  do {
    const page = await list({ token, limit: 1000, cursor });
    for (const b of page.blobs) existing.add(b.pathname);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}

const targets = (test ? files.slice(0, 1) : files).filter(
  (f) => !existing.has(f),
);
console.log(
  `Uploading ${targets.length} of ${files.length} images (${existing.size} already in store)`,
);

let done = 0;
let failed = 0;
let firstUrl = null;

const CONCURRENCY = 5;
async function uploadOne(f) {
  const ext = path.extname(f).toLowerCase();
  const contentType =
    ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await put(f, fs.createReadStream(path.join(dir, f)), {
        access: "public",
        token,
        contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
    } catch (e) {
      if (/too many requests/i.test(e.message) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 65_000));
        continue;
      }
      throw e;
    }
  }
}

async function worker(queue) {
  while (queue.length) {
    const f = queue.shift();
    try {
      const { url } = await uploadOne(f);
      firstUrl ??= url;
      done++;
    } catch (e) {
      failed++;
      console.error(`FAILED ${f}: ${e.message}`);
    }
    if (done % 250 === 0 && done > 0) console.log(`${done} uploaded...`);
  }
}

const queue = [...targets];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
console.log(`Done: ${done} uploaded, ${failed} failed`);
if (firstUrl) console.log(`Example URL: ${firstUrl}`);
