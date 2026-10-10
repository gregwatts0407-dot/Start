/**
 * Standalone build: the sandboxed frame ignores plain download links, so
 * files go through the Artifact `downloads` capability when available.
 */
import { toast } from "sonner";
import { useCapability } from "./claude";

interface Downloads {
  save(req: { filename: string; data: Blob }): Promise<{ status: string }>;
}

export async function saveImageFile(src: string, filename: string): Promise<void> {
  const downloads = await useCapability<Downloads>("downloads", 4000);
  if (!downloads) {
    toast("Saving files isn’t available here", { description: "Open “View full image” and save it from there." });
    return;
  }
  try {
    const blob = await (await fetch(src)).blob();
    const res = await downloads.save({ filename, data: blob });
    if (res.status === "saved") toast.success("Image saved");
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code && code !== "cancelled" && code !== "declined") toast.error("Couldn’t save the image");
  }
}
