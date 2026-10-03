// Seed image_path points at the scrape dir (recipes-full/<slug>.<ext>);
// images are uploaded to Vercel Blob under the bare filename (<slug>.<ext>).
// Falls back to the original Mealime CDN URL for anything not uploaded.
// Kept pg-free so client components can import it.
const BLOB_BASE = "https://waxuaeksz3deu1yk.public.blob.vercel-storage.com";

export function imageSrc(r: {
  image_path: string | null;
  image_url: string | null;
}): string | null {
  if (r.image_path) return `${BLOB_BASE}/${r.image_path.split("/").pop()}`;
  return r.image_url;
}
