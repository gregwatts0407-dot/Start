/**
 * Built-in gallery. All images ship in /public/images (3200px long edge,
 * WebP) so the app is immediately playable offline. Sources are CC0 /
 * Unsplash-licensed / CC BY-SA wallpapers from open-source desktop projects
 * (see /public/images/CREDITS.md).
 */

import { ASSET_PREFIX } from "@/lib/env";

export type Category =
  | "Landscapes"
  | "Nature"
  | "Animals"
  | "Architecture"
  | "Art"
  | "Abstract"
  | "Travel"
  | "Space";

export const CATEGORIES: Category[] = [
  "Landscapes",
  "Nature",
  "Animals",
  "Architecture",
  "Art",
  "Abstract",
  "Travel",
  "Space",
];

export interface GalleryImage {
  id: string;
  title: string;
  category: Category;
  credit: string;
  width: number;
  height: number;
  /** Full-resolution source. */
  src: string;
  thumb: string;
  /** Dominant tone, used as a placeholder while thumbnails load. */
  tint: string;
  custom?: boolean;
}

type Entry = [id: string, title: string, category: Category, credit: string, w: number, h: number, tint: string];

const ENTRIES: Entry[] = [
  ["yosemite-valley", "Yosemite Valley", "Landscapes", "Aniket Deole", 3200, 2134, "#4b5a45"],
  ["dolomite-ridges", "Dolomite Ridges", "Landscapes", "Benjamin Voros", 3200, 2133, "#8d8a86"],
  ["monument-valley", "Monument Valley", "Landscapes", "Jasper van der Meij", 3200, 2120, "#b9653a"],
  ["mirror-lake", "Mirror Lake", "Landscapes", "Sean Afnan", 3200, 2133, "#7a6a55"],
  ["pier-at-dusk", "Pier at Dusk", "Landscapes", "Paul Carmona", 3200, 2133, "#5d6176"],
  ["dahlia-bloom", "Dahlia Bloom", "Nature", "Tj Holowaychuk", 3200, 1799, "#4a2e5a"],
  ["forget-me-nots", "Forget-me-nots", "Nature", "Budgie Backgrounds (CC0)", 3200, 2133, "#2d4a3a"],
  ["fern-canopy", "Fern Canopy", "Nature", "Nick Cooper", 3200, 2133, "#1d2a1f"],
  ["river-otters", "River Otters", "Animals", "Derrick Coetzee (CC0)", 3200, 1800, "#4d5446"],
  ["perched-osprey", "Perched Osprey", "Animals", "NPS / Jacob W. Frank", 3200, 1800, "#5a6a48"],
  ["green-heron", "Green Heron", "Animals", "Budgie Backgrounds (CC0)", 3200, 1800, "#6f8a5a"],
  ["drifting-jellyfish", "Drifting Jellyfish", "Animals", "NG / Unsplash", 3000, 2000, "#0b4f8f"],
  ["casa-mila", "Casa Milà Courtyard", "Architecture", "Budgie Backgrounds (CC0)", 3200, 2133, "#7a3a22"],
  ["colosseum", "The Colosseum", "Architecture", "Budgie Backgrounds (CC0)", 3200, 1800, "#5d7f99"],
  ["glass-facets", "Glass Facets", "Architecture", "Ferdinand Stöhr", 3200, 2133, "#4a5a8a"],
  ["aulenti-tower", "Aulenti Tower", "Architecture", "Budgie Backgrounds (CC0)", 3200, 2133, "#9a9ea2"],
  ["great-wave", "Great Wave", "Art", "Budgie Backgrounds (CC0)", 3200, 1800, "#2a4f8a"],
  ["desert-outpost", "Desert Outpost", "Art", "Nick Nazzaro / System76 (CC BY-SA 4.0)", 3200, 1800, "#d98a4a"],
  ["deep-sea-station", "Deep Sea Station", "Art", "Nick Nazzaro / System76 (CC BY-SA 4.0)", 3200, 1800, "#4a4f9a"],
  ["silver-spiral", "Silver Spiral", "Abstract", "Budgie Backgrounds (CC0)", 3200, 1800, "#555555"],
  ["teal-scales", "Teal Scales", "Abstract", "Ricardo Gomez Angel", 3200, 1955, "#2a8a8a"],
  ["spice-market", "Spice Market", "Travel", "Budgie Backgrounds (CC0)", 3200, 2133, "#8a5a3a"],
  ["singapore-skyline", "Singapore Skyline", "Travel", "Romain Guy", 3200, 1800, "#3a4a7a"],
  ["tea-gardens", "Tea Gardens", "Travel", "Budgie Backgrounds (CC0)", 3200, 2133, "#7a9a3a"],
  ["carina-nebula", "Carina Nebula", "Space", "NASA", 3200, 1538, "#8a4a1a"],
  ["earth-at-night", "Earth at Night", "Space", "NASA", 3200, 2129, "#0d1a2a"],
  ["saturn-profile", "Saturn in Profile", "Space", "NASA / Cassini", 3200, 1333, "#111111"],
];

export const GALLERY: GalleryImage[] = ENTRIES.map(([id, title, category, credit, width, height, tint]) => ({
  id,
  title,
  category,
  credit,
  width,
  height,
  tint,
  src: `${ASSET_PREFIX}images/full/${id}.webp`,
  thumb: `${ASSET_PREFIX}images/thumbs/${id}.webp`,
}));

export function getGalleryImage(id: string): GalleryImage | undefined {
  return GALLERY.find((g) => g.id === id);
}
