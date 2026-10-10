/**
 * User-uploaded images: downscale, store in IndexedDB and expose them in the
 * same shape as gallery images.
 */
import type { GalleryImage } from "./images";
import { getGalleryImage } from "./images";
import { getImage, newId, putImage, type StoredImage } from "./storage";

const MAX_EDGE = 3600;
const THUMB_EDGE = 720;

function canvasToBlob(c: HTMLCanvasElement, type: string, q: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), type, q),
  );
}

async function resize(bmp: ImageBitmap, maxEdge: number, q: number): Promise<{ blob: Blob; w: number; h: number }> {
  const s = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s);
  const h = Math.round(bmp.height * s);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);
  let blob = await canvasToBlob(c, "image/webp", q);
  if (blob.type !== "image/webp") blob = await canvasToBlob(c, "image/jpeg", q);
  c.width = 0;
  return { blob, w, h };
}

/** Import a user file as a puzzle image. Returns the new image id (`custom:<uuid>`). */
export async function importImageFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  const bmp = await createImageBitmap(file);
  if (bmp.width < 400 || bmp.height < 300) {
    bmp.close();
    throw new Error("That image is too small — please use at least 400 × 300 px.");
  }
  const full = await resize(bmp, MAX_EDGE, 0.9);
  const thumb = await resize(bmp, THUMB_EDGE, 0.8);
  bmp.close();
  const id = newId();
  const title = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "My image";
  await putImage({ id, title, blob: full.blob, thumb: thumb.blob, width: full.w, height: full.h, createdAt: Date.now() });
  return `custom:${id}`;
}

const urlCache = new Map<string, { src: string; thumb: string }>();

/** Gallery-shaped view of a stored image (object URLs are cached per session). */
export function storedToGallery(img: StoredImage): GalleryImage {
  let urls = urlCache.get(img.id);
  if (!urls) {
    urls = { src: URL.createObjectURL(img.blob), thumb: URL.createObjectURL(img.thumb ?? img.blob) };
    urlCache.set(img.id, urls);
  }
  return {
    id: `custom:${img.id}`,
    title: img.title,
    category: "Art",
    credit: "Your upload",
    width: img.width,
    height: img.height,
    src: urls.src,
    thumb: urls.thumb,
    tint: "#444",
    custom: true,
  };
}

/** Resolve any image id (built-in or custom) to its gallery description. */
export async function resolveImage(id: string): Promise<GalleryImage | undefined> {
  if (id.startsWith("custom:")) {
    const rec = await getImage(id.slice(7));
    return rec ? storedToGallery(rec) : undefined;
  }
  return getGalleryImage(id);
}

/** Load & decode an image ready for the engine. */
export async function loadImageElement(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();
  return img;
}
