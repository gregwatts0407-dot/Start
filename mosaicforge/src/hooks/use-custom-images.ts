"use client";

import { useEffect, useState } from "react";
import { listImages } from "@/lib/storage";
import { storedToGallery } from "@/lib/custom-images";
import type { GalleryImage } from "@/lib/images";

/** User-uploaded images as gallery entries. */
export function useCustomImages() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  useEffect(() => {
    const load = () =>
      listImages()
        .then((list) => setImages(list.map(storedToGallery)))
        .catch(() => setImages([]));
    load();
    window.addEventListener("mosaicforge:images-changed", load);
    return () => window.removeEventListener("mosaicforge:images-changed", load);
  }, []);
  return images;
}
