/**
 * Platform helpers that differ between the Next.js app and the standalone
 * build (which runs in a sandboxed frame where plain download links are inert).
 */

/** Offer an image (by URL) to the user as a file download. */
export async function saveImageFile(src: string, filename: string): Promise<void> {
  const a = document.createElement("a");
  a.href = src;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
