import { get, set } from "idb-keyval";

export type Category = "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory";
export type Season = "spring" | "summer" | "fall" | "winter";
export type Style = "casual" | "formal" | "sport" | "elegant";
export type ColorMode = "contrast" | "analogous" | "monochrome";
export type Pattern = "solid" | "striped" | "checked" | "floral" | "graphic" | "other";

export interface ClothingItem {
  id: string;
  name: string;
  category: Category;
  primaryColor: string;
  colorName: string;
  secondaryColors: string[];
  secondaryColorNames: string[];
  pattern: Pattern;
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

const KEY = "wardrobe.items.v2";
let cache: ClothingItem[] | null = null;

function normalize(raw: Partial<ClothingItem> & { id: string; imageDataUrl: string }): ClothingItem {
  return {
    id: raw.id,
    name: raw.name ?? "Kıyafet",
    category: (raw.category as Category) ?? "top",
    primaryColor: raw.primaryColor ?? "#888888",
    colorName: raw.colorName ?? "renk",
    secondaryColors: raw.secondaryColors ?? [],
    secondaryColorNames: raw.secondaryColorNames ?? [],
    pattern: (raw.pattern as Pattern) ?? "solid",
    seasons: raw.seasons ?? ["spring", "summer", "fall", "winter"],
    style: (raw.style as Style) ?? "casual",
    imageDataUrl: raw.imageDataUrl,
    createdAt: raw.createdAt ?? Date.now(),
  };
}

export function loadItems(): ClothingItem[] {
  return cache ?? [];
}

export async function loadItemsAsync(): Promise<ClothingItem[]> {
  if (cache !== null) return cache;
  try {
    const stored = (await get<ClothingItem[]>(KEY)) ?? [];
    cache = stored.map((i) => normalize(i));
  } catch {
    cache = [];
  }
  // localStorage fallback migration
  if (cache.length === 0 && typeof window !== "undefined") {
    try {
      const legacy = window.localStorage.getItem(KEY) ?? window.localStorage.getItem("wardrobe.items.v1");
      if (legacy) {
        const parsed = JSON.parse(legacy) as ClothingItem[];
        cache = parsed.map((i) => normalize(i));
        await set(KEY, cache);
      }
    } catch { /* ignore */ }
  }
  return cache;
}

async function persist() {
  if (cache) await set(KEY, cache);
}

export async function addItem(item: ClothingItem): Promise<ClothingItem[]> {
  cache = [normalize(item), ...(cache ?? [])];
  await persist();
  return cache;
}

export async function removeItem(id: string): Promise<ClothingItem[]> {
  cache = (cache ?? []).filter((i) => i.id !== id);
  await persist();
  return cache;
}

export async function updateItem(updated: ClothingItem): Promise<ClothingItem[]> {
  cache = (cache ?? []).map((i) => (i.id === updated.id ? normalize(updated) : i));
  await persist();
  return cache;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const m = hex.replace("#", "");
  const r = parseInt(m.substring(0, 2), 16) / 255;
  const g = parseInt(m.substring(2, 4), 16) / 255;
  const b = parseInt(m.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
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
  if (isNeutral(a) || isNeutral(b)) return 0.85;
  const dist = hueDistance(hexToHsl(a).h, hexToHsl(b).h);
  switch (mode) {
    case "contrast": return 1 - Math.abs(165 - dist) / 165;
    case "analogous": return dist <= 40 ? 1 - dist / 40 : 0;
    case "monochrome": return dist <= 15 ? 1 - dist / 15 : 0;
  }
}

function itemColorScore(a: ClothingItem, b: ClothingItem, mode: ColorMode): number {
  const aColors = [a.primaryColor, ...(a.secondaryColors ?? [])].filter(Boolean);
  const bColors = [b.primaryColor, ...(b.secondaryColors ?? [])].filter(Boolean);
  let best = 0;
  for (const ca of aColors) for (const cb of bColors) { const s = colorScore(ca, cb, mode); if (s > best) best = s; }
  return best;
}

export interface GenerateOptions {
  season: Season;
  colorMode: ColorMode;
  style?: Style | "any";
  count?: number;
}

function pickBest<T>(arr: T[], score: (x: T) => number, k: number): T[] {
  return [...arr].map((x) => ({ x, s: score(x) + Math.random() * 0.15 })).sort((a, b) => b.s - a.s).slice(0, k).map((p) => p.x);
}

export function generateOutfitsFor(seed: ClothingItem, items: ClothingItem[], opts: GenerateOptions): Outfit[] {
  const { season, colorMode, style = "any", count = 3 } = opts;
  const pool = items.filter((i) => i.id !== seed.id && i.seasons.includes(season) && (style === "any" || i.style === style));
  const byCat = (c: Category) => pool.filter((i) => i.category === c);
  const tops = byCat("top"), bottoms = byCat("bottom"), dresses = byCat("dress");
  const outerwear = byCat("outerwear"), shoes = byCat("shoes"), accessories = byCat("accessory");
  const needOuter = season === "winter" || season === "fall";

  function buildSlots(): Category[][] {
    switch (seed.category) {
      case "top": return [["bottom", "shoes"], ["bottom", "shoes", "accessory"], needOuter ? ["bottom", "shoes", "outerwear"] : ["bottom", "shoes", "accessory"]];
      case "bottom": return [["top", "shoes"], ["top", "shoes", "accessory"], needOuter ? ["top", "shoes", "outerwear"] : ["top", "shoes", "accessory"]];
      case "dress": return [["shoes"], ["shoes", "accessory"], needOuter ? ["shoes", "outerwear"] : ["shoes", "accessory"]];
      case "outerwear": return [["top", "bottom", "shoes"], dresses.length ? ["dress", "shoes"] : ["top", "bottom", "shoes", "accessory"], ["top", "bottom", "shoes", "accessory"]];
      case "shoes": return [["top", "bottom"], dresses.length ? ["dress"] : ["top", "bottom", "accessory"], ["top", "bottom", "accessory"]];
      case "accessory": return [["top", "bottom", "shoes"], dresses.length ? ["dress", "shoes"] : ["top", "bottom", "shoes"], needOuter ? ["top", "bottom", "shoes", "outerwear"] : ["top", "bottom", "shoes"]];
    }
  }

  const slotSets = buildSlots();
  const outfits: Outfit[] = [];
  const seen = new Set<string>();
  const scoreVs = (c: ClothingItem) => itemColorScore(seed, c, colorMode);

  for (const slots of slotSets) {
    const chosen: ClothingItem[] = [seed];
    let ok = true;
    for (const cat of slots) {
      const arr = cat === "top" ? tops : cat === "bottom" ? bottoms : cat === "dress" ? dresses : cat === "outerwear" ? outerwear : cat === "shoes" ? shoes : accessories;
      if (arr.length === 0) { if (cat === "accessory" || cat === "outerwear" || cat === "shoes") continue; ok = false; break; }
      const remaining = arr.filter((x) => !chosen.find((c) => c.id === x.id));
      if (remaining.length === 0) { if (cat === "accessory" || cat === "outerwear" || cat === "shoes") continue; ok = false; break; }
      chosen.push(pickBest(remaining, scoreVs, 1)[0]);
    }
    if (!ok || chosen.length < 2) continue;
    const key = chosen.map((i) => i.id).sort().join("-");
    if (seen.has(key)) continue;
    seen.add(key);
    const others = chosen.filter((i) => i.id !== seed.id);
    outfits.push({ id: crypto.randomUUID(), items: chosen, reason: `${seed.colorName} ${labelCategory(seed.category).toLowerCase()} + ${others.map((o) => o.colorName).join(" · ")} (${labelMode(colorMode)})` });
    if (outfits.length >= count) break;
  }
  return outfits;
}

export function labelMode(m: ColorMode): string { return m === "contrast" ? "kontrast" : m === "analogous" ? "yakın renk" : "tek renk"; }
export function labelSeason(s: Season): string { return { spring: "ilkbahar", summer: "yaz", fall: "sonbahar", winter: "kış" }[s]; }
export function labelCategory(c: Category): string { return { top: "Üst", bottom: "Alt", dress: "Elbise", outerwear: "Dış Giyim", shoes: "Ayakkabı", accessory: "Aksesuar" }[c]; }
export function labelStyle(s: Style): string { return { casual: "Günlük", formal: "Resmi", sport: "Spor", elegant: "Şık" }[s]; }
export function labelPattern(p: Pattern): string { return { solid: "Düz", striped: "Çizgili", checked: "Kareli", floral: "Çiçekli", graphic: "Baskılı", other: "Desenli" }[p]; }

export function currentSeason(): Season {
  const m = new Date().getMonth();
  if (m <= 1 || m === 11) return "winter";
  if (m <= 4) return "spring";
  if (m <= 7) return "summer";
  return "fall";
}
