"use client";

import { useRef, useState } from "react";
import { ImagePlusIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { importImageFile } from "@/lib/custom-images";

/** "Use your own image" tile: imports a local file into IndexedDB. */
export function UploadCard({ onImported }: { onImported: (id: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  async function handle(file?: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const id = await importImageFile(file);
      toast.success("Image added to your gallery");
      onImported(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not import that image");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <button
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void handle(e.dataTransfer.files?.[0]);
      }}
      className={`flex aspect-[3/2] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:border-gold/60 hover:text-foreground ${over ? "border-gold bg-gold/5" : ""}`}
    >
      {busy ? <Loader2Icon className="size-7 animate-spin" /> : <ImagePlusIcon className="size-7" />}
      <span className="font-medium">Use your own image</span>
      <span className="text-xs">Drop a photo here or click to browse</span>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handle(e.target.files?.[0])}
      />
    </button>
  );
}
