// One-off: upload all recipe images from ../recipes-full/ to Vercel Blob.
// Usage: BLOB_READ_WRITE_TOKEN=... node scripts/upload-images.mjs [--test]
// --test uploads a single image and prints its public URL (use to confirm
// the store's base URL before hardcoding it in src/lib/images.ts).
// Resumable/idempotent: allowOverwrite makes reruns safe.
import { put } from "@vercel/blob";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.error("BLOB_READ_WRITE_TOKEN not set");
  process.exit(1);
}

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// Source dir overridable: recipes-webp holds the compressed WebP corpus.
const dir = path.join(repoRoot, process.env.IMAGE_DIR ?? "recipes-full");
const files = fs
  .readdirSync(dir)
  .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
  .sort();

const test = process.argv.includes("--test");

// Resumable: each file is HEAD-checked individually in the worker, so
// reruns only upload files missing from the store.
const targets = test ? files.slice(0, 1) : files;
console.log(`Uploading ${targets.length} of ${files.length} images`);

let done = 0;
let skipped = 0;
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

// Public store base URL — keep in sync with BLOB_BASE in src/lib/images.ts.
// Existence is checked with a plain HTTP HEAD: 200 = skip, 404 = upload.
const BLOB_BASE = "https://waxuaeksz3deu1yk.public.blob.vercel-storage.com";

async function exists(f) {
  const res = await fetch(`${BLOB_BASE}/${f}`, { method: "HEAD" });
  if (res.status === 200) return true;
  if (res.status === 404) return false;
  throw new Error(`HEAD ${f} returned ${res.status}`);
}

async function worker(queue) {
  while (queue.length) {
    const f = queue.shift();
    try {
      if (await exists(f)) {
        skipped++;
      } else {
        const { url } = await uploadOne(f);
        firstUrl ??= url;
        done++;
      }
    } catch (e) {
      failed++;
      console.error(`FAILED ${f}: ${e.message}`);
    }
    const processed = done + skipped;
    if (processed % 250 === 0 && processed > 0)
      console.log(`${processed} processed (${done} uploaded, ${skipped} skipped)...`);
  }
}

const queue = [...targets];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
console.log(`Done: ${done} uploaded, ${skipped} skipped (already in store), ${failed} failed`);
if (firstUrl) console.log(`Example URL: ${firstUrl}`);
