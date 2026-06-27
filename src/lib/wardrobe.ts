export type Category = "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory";
export type Season = "spring" | "summer" | "fall" | "winter";
export type Style = "casual" | "formal" | "sport" | "elegant";
export type ColorMode = "contrast" | "analogous" | "monochrome";

export interface ClothingItem {
  id: string;
  name: string;
  category: Category;
  primaryColor: string; // #RRGGBB
  colorName: string;
  seasons: Season[];
  style: Style;
  imageDataUrl: string;
  createdAt: number;
}

export interface Outfit {
  id: string;
  items: ClothingItem[];
  reason: string;
}

import { get, set } from "idb-keyval";

const STORAGE_KEY = "wardrobe.items.v1";
const IDB_KEY = "wardrobe.items.v2";

let cache: ClothingItem[] | null = null;
let loaded = false;

export function loadItems(): ClothingItem[] {
  return cache ?? [];
}

// Async loader: migrates from localStorage to IndexedDB on first run.
export async function loadItemsAsync(): Promise<ClothingItem[]> {
  if (loaded) return cache ?? [];
  if (typeof window === "undefined") return [];
  try {
    const fromIdb = await get<ClothingItem[]>(IDB_KEY);
    if (fromIdb && fromIdb.length) {
      cache = fromIdb;
    } else {
      // migrate from localStorage if present
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          cache = JSON.parse(raw) as ClothingItem[];
          await set(IDB_KEY, cache);
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          cache = [];
        }
      } else {
        cache = [];
      }
    }
  } catch {
    cache = [];
  }
  loaded = true;
  return cache ?? [];
}

async function persist(items: ClothingItem[]): Promise<void> {
  cache = items;
  await set(IDB_KEY, items);
}

export async function addItem(item: ClothingItem): Promise<ClothingItem[]> {
  const items = [item, ...(cache ?? [])];
  await persist(items);
  return items;
}

export async function removeItem(id: string): Promise<ClothingItem[]> {
  const items = (cache ?? []).filter((i) => i.id !== id);
  await persist(items);
  return items;
}

// --- Color helpers ---
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const m = hex.replace("#", "");
  const r = parseInt(m.substring(0, 2), 16) / 255;
  const g = parseInt(m.substring(2, 4), 16) / 255;
  const b = parseInt(m.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function isNeutral(hex: string): boolean {
  const { s, l } = hexToHsl(hex);
  return s < 0.15 || l < 0.12 || l > 0.92;
}

function colorScore(a: string, b: string, mode: ColorMode): number {
  // Neutrals go with everything
  if (isNeutral(a) || isNeutral(b)) return 0.85;
  const ha = hexToHsl(a).h;
  const hb = hexToHsl(b).h;
  const dist = hueDistance(ha, hb);
  switch (mode) {
    case "contrast":
      // best around 150-180 (complementary)
      return 1 - Math.abs(165 - dist) / 165;
    case "analogous":
      // best 0-40
      return dist <= 40 ? 1 - dist / 40 : 0;
    case "monochrome":
      return dist <= 15 ? 1 - dist / 15 : 0;
  }
}

// --- Outfit generation ---
export interface GenerateOptions {
  season: Season;
  colorMode: ColorMode;
  style?: Style | "any";
  count?: number;
}

function pickBest<T>(arr: T[], score: (x: T) => number, k: number): T[] {
  return [...arr]
    .map((x) => ({ x, s: score(x) + Math.random() * 0.15 }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((p) => p.x);
}

// Build outfits seeded by a specific item the user selected.
export function generateOutfitsFor(
  seed: ClothingItem,
  items: ClothingItem[],
  opts: GenerateOptions,
): Outfit[] {
  const { season, colorMode, style = "any", count = 3 } = opts;

  const pool = items.filter(
    (i) =>
      i.id !== seed.id &&
      i.seasons.includes(season) &&
      (style === "any" || i.style === style),
  );

  const byCat = (c: Category) => pool.filter((i) => i.category === c);
  const tops = byCat("top");
  const bottoms = byCat("bottom");
  const dresses = byCat("dress");
  const outerwear = byCat("outerwear");
  const shoes = byCat("shoes");
  const accessories = byCat("accessory");

  const needOuter = season === "winter" || season === "fall";

  // What other slots does the seed need to complete an outfit?
  function buildSlots(): Category[][] {
    switch (seed.category) {
      case "top":
        return [["bottom", "shoes"], ["bottom", "shoes", "accessory"], needOuter ? ["bottom", "shoes", "outerwear"] : ["bottom", "shoes", "accessory"]];
      case "bottom":
        return [["top", "shoes"], ["top", "shoes", "accessory"], needOuter ? ["top", "shoes", "outerwear"] : ["top", "shoes", "accessory"]];
      case "dress":
        return [["shoes"], ["shoes", "accessory"], needOuter ? ["shoes", "outerwear"] : ["shoes", "accessory"]];
      case "outerwear":
        return [["top", "bottom", "shoes"], dresses.length ? ["dress", "shoes"] : ["top", "bottom", "shoes", "accessory"], ["top", "bottom", "shoes", "accessory"]];
      case "shoes":
        return [["top", "bottom"], dresses.length ? ["dress"] : ["top", "bottom", "accessory"], ["top", "bottom", "accessory"]];
      case "accessory":
        return [["top", "bottom", "shoes"], dresses.length ? ["dress", "shoes"] : ["top", "bottom", "shoes"], needOuter ? ["top", "bottom", "shoes", "outerwear"] : ["top", "bottom", "shoes"]];
    }
  }

  const slotSets = buildSlots();
  const outfits: Outfit[] = [];
  const seen = new Set<string>();
  const buildKey = (its: ClothingItem[]) => its.map((i) => i.id).sort().join("-");

  // Score a candidate against the seed
  const scoreVs = (c: ClothingItem) =>
    colorScore(seed.primaryColor, c.primaryColor, colorMode);

  for (const slots of slotSets) {
    const chosen: ClothingItem[] = [seed];
    let ok = true;
    for (const cat of slots) {
      const arr =
        cat === "top" ? tops :
        cat === "bottom" ? bottoms :
        cat === "dress" ? dresses :
        cat === "outerwear" ? outerwear :
        cat === "shoes" ? shoes : accessories;
      if (arr.length === 0) {
        // Optional categories: accessory/outerwear can be skipped
        if (cat === "accessory" || cat === "outerwear") continue;
        ok = false;
        break;
      }
      // Avoid duplicates already chosen
      const remaining = arr.filter((x) => !chosen.find((c) => c.id === x.id));
      if (remaining.length === 0) {
        if (cat === "accessory" || cat === "outerwear") continue;
        ok = false;
        break;
      }
      const pick = pickBest(remaining, scoreVs, 1)[0];
      chosen.push(pick);
    }
    if (!ok || chosen.length < 2) continue;
    const key = buildKey(chosen);
    if (seen.has(key)) continue;
    seen.add(key);

    const others = chosen.filter((i) => i.id !== seed.id);
    const reason = `${seed.colorName} ${labelCategory(seed.category).toLowerCase()} + ${others.map((o) => o.colorName).join(" · ")} (${labelMode(colorMode)})`;
    outfits.push({ id: crypto.randomUUID(), items: chosen, reason });
    if (outfits.length >= count) break;
  }

  return outfits;
}


export function labelMode(m: ColorMode): string {
  return m === "contrast" ? "kontrast" : m === "analogous" ? "yakın renk" : "tek renk";
}
export function labelSeason(s: Season): string {
  return { spring: "ilkbahar", summer: "yaz", fall: "sonbahar", winter: "kış" }[s];
}
export function labelCategory(c: Category): string {
  return { top: "Üst", bottom: "Alt", dress: "Elbise", outerwear: "Dış giyim", shoes: "Ayakkabı", accessory: "Aksesuar" }[c];
}
export function labelStyle(s: Style): string {
  return { casual: "Günlük", formal: "Resmi", sport: "Spor", elegant: "Şık" }[s];
}

export function currentSeason(): Season {
  const m = new Date().getMonth();
  if (m <= 1 || m === 11) return "winter";
  if (m <= 4) return "spring";
  if (m <= 7) return "summer";
  return "fall";
}
