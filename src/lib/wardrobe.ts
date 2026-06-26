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

const STORAGE_KEY = "wardrobe.items.v1";

export function loadItems(): ClothingItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ClothingItem[];
  } catch {
    return [];
  }
}

export function saveItems(items: ClothingItem[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function addItem(item: ClothingItem): ClothingItem[] {
  const items = [item, ...loadItems()];
  saveItems(items);
  return items;
}

export function removeItem(id: string): ClothingItem[] {
  const items = loadItems().filter((i) => i.id !== id);
  saveItems(items);
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

export function generateOutfits(items: ClothingItem[], opts: GenerateOptions): Outfit[] {
  const { season, colorMode, style = "any", count = 4 } = opts;
  const seasonal = items.filter(
    (i) => i.seasons.includes(season) && (style === "any" || i.style === style),
  );

  const tops = seasonal.filter((i) => i.category === "top");
  const bottoms = seasonal.filter((i) => i.category === "bottom");
  const dresses = seasonal.filter((i) => i.category === "dress");
  const outerwear = seasonal.filter((i) => i.category === "outerwear");
  const shoes = seasonal.filter((i) => i.category === "shoes");
  const accessories = seasonal.filter((i) => i.category === "accessory");

  const outfits: Outfit[] = [];
  const seen = new Set<string>();

  const buildKey = (its: ClothingItem[]) =>
    its
      .map((i) => i.id)
      .sort()
      .join("-");

  // Combo 1: dress-based
  for (const dress of pickBest(dresses, () => 1, Math.min(2, dresses.length))) {
    const shoe = pickBest(shoes, (s) => colorScore(dress.primaryColor, s.primaryColor, colorMode), 1)[0];
    const outer = season === "winter" || season === "fall"
      ? pickBest(outerwear, (o) => colorScore(dress.primaryColor, o.primaryColor, colorMode), 1)[0]
      : undefined;
    const acc = pickBest(accessories, (a) => colorScore(dress.primaryColor, a.primaryColor, colorMode), 1)[0];
    const its = [dress, shoe, outer, acc].filter(Boolean) as ClothingItem[];
    if (its.length < 2) continue;
    const key = buildKey(its);
    if (seen.has(key)) continue;
    seen.add(key);
    outfits.push({
      id: crypto.randomUUID(),
      items: its,
      reason: `${labelMode(colorMode)} renk uyumu ile ${labelSeason(season)} elbise kombini`,
    });
  }

  // Combo: top + bottom
  for (const top of tops) {
    if (outfits.length >= count + 3) break;
    const bottom = pickBest(bottoms, (b) => colorScore(top.primaryColor, b.primaryColor, colorMode), 1)[0];
    if (!bottom) continue;
    const shoe = pickBest(shoes, (s) => (colorScore(top.primaryColor, s.primaryColor, colorMode) + colorScore(bottom.primaryColor, s.primaryColor, colorMode)) / 2, 1)[0];
    const outer = (season === "winter" || season === "fall")
      ? pickBest(outerwear, (o) => colorScore(top.primaryColor, o.primaryColor, colorMode), 1)[0]
      : undefined;
    const acc = pickBest(accessories, () => Math.random(), 1)[0];
    const its = [top, bottom, outer, shoe, acc].filter(Boolean) as ClothingItem[];
    if (its.length < 2) continue;
    const key = buildKey(its);
    if (seen.has(key)) continue;
    seen.add(key);
    outfits.push({
      id: crypto.randomUUID(),
      items: its,
      reason: `${top.colorName} + ${bottom.colorName} (${labelMode(colorMode)})`,
    });
  }

  return outfits.slice(0, count);
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
