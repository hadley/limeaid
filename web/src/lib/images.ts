// Seed image_path points at the scrape dir (recipes-full/<slug>.<ext>);
// in the app images are served from /recipes/<slug>.<ext>.
// Kept pg-free so client components can import it.
export function imageSrc(r: {
  image_path: string | null;
  image_url: string | null;
}): string | null {
  if (r.image_path) return `/recipes/${r.image_path.split("/").pop()}`;
  return r.image_url;
}
