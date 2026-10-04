// Every recipe image lives in Vercel Blob as <slug>.webp (WebP-compressed).
// Kept pg-free so client components can import it.
const BLOB_BASE = "https://waxuaeksz3deu1yk.public.blob.vercel-storage.com";

export function imageSrc(r: { slug: string }): string {
  return `${BLOB_BASE}/${r.slug}.webp`;
}
