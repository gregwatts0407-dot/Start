"use client";

import { MaximizeIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { GalleryImage } from "@/lib/images";
import { cn } from "@/lib/utils";

export function ImageCard({
  image,
  inProgress,
  onSelect,
  onDelete,
}: {
  image: GalleryImage;
  inProgress?: number;
  onSelect: (img: GalleryImage) => void;
  onDelete?: (img: GalleryImage) => void;
}) {
  return (
    <div className="group relative">
      <button
        onClick={() => onSelect(image)}
        className="block w-full overflow-hidden rounded-xl text-left shadow-sm ring-1 ring-foreground/5 transition-all duration-300 outline-none hover:-translate-y-0.5 hover:shadow-xl focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        <div className="relative aspect-[3/2] overflow-hidden" style={{ backgroundColor: image.tint }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.thumb}
            alt={image.title}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
          <div className="absolute top-2.5 left-2.5 flex gap-1.5">
            <Badge variant="glass">{image.custom ? "Your image" : image.category}</Badge>
            {!!inProgress && <Badge className="bg-gold text-black">{inProgress} in progress</Badge>}
          </div>
          <span className="absolute top-2.5 right-2.5 flex size-8 items-center justify-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100">
            <MaximizeIcon className="size-3.5" />
          </span>
          <div className="absolute inset-x-0 bottom-0 p-3.5">
            <h3 className="font-display text-lg leading-tight font-semibold text-white">{image.title}</h3>
            <p className="mt-0.5 truncate text-xs text-white/70">{image.credit}</p>
          </div>
        </div>
      </button>
      {onDelete && (
        <button
          onClick={() => onDelete(image)}
          className={cn(
            "absolute right-2.5 bottom-2.5 flex size-8 items-center justify-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100 hover:bg-red-600",
          )}
          aria-label={`Delete ${image.title}`}
        >
          <Trash2Icon className="size-3.5" />
        </button>
      )}
    </div>
  );
}
