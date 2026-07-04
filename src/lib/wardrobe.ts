import { get as idbGet, del as idbDel } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";

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
  imageDataUrl: string; // display URL (signed) — kept name for compatibility
  imagePath: string;    // storage object path
  createdAt: number;
}

export interface Outfit {
  id: string;
  items: ClothingItem[];
  reason: string;
}

const BUCKET = "wardrobe";
const IDB_KEY = "wardrobe.items.v2";
let cache: ClothingItem[] = [];

function normalize(row: any, signedUrl: string): ClothingItem {
  return {
    id: row.id,
    name: row.name ?? "Kıyafet",
    category: (row.category as Category) ?? "top",
    primaryColor: row.primary_color ?? "#888888",
    colorName: row.color_name ?? "renk",
    secondaryColors: row.secondary_colors ?? [],
    secondaryColorNames: row.secondary_color_names ?? [],
    pattern: (row.pattern as Pattern) ?? "solid",
    seasons: row.seasons ?? ["spring", "summer", "fall", "winter"],
    style: (row.style as Style) ?? "casual",
    imagePath: row.image_path,
    imageDataUrl: signedUrl,
    createdAt: new Date(row.created_at).getTime(),
  };
}

async function signPaths(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 6);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
  return map;
}

export function loadItems(): ClothingItem[] {
  return cache;
}

export async function loadItemsAsync(): Promise<ClothingItem[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { cache = []; return cache; }
  const { data, error } = await supabase.from("clothing_items").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  const urls = await signPaths((data ?? []).map((r) => r.image_path));
  cache = (data ?? []).map((r) => normalize(r, urls[r.image_path] ?? ""));
  return cache;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(",");
  const mime = /data:(.*?);/.exec(meta)?.[1] ?? "image/jpeg";
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: mime });
}

export interface NewItemInput {
  name: string;
  category: Category;
  primaryColor: string;
  colorName: string;
  secondaryColors: string[];
  secondaryColorNames: string[];
  pattern: Pattern;
  seasons: Season[];
  style: Style;
  imageDataUrl: string; // downscaled jpeg data url
}

export async function addItem(input: NewItemInput): Promise<ClothingItem[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Giriş yapılmadı");
  const blob = dataUrlToBlob(input.imageDataUrl);
  const path = `${user.id}/${crypto.randomUUID()}.jpg`;
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
  if (up.error) throw up.error;
  const { data, error } = await supabase.from("clothing_items").insert({
    user_id: user.id,
    name: input.name,
    category: input.category,
    primary_color: input.primaryColor,
    color_name: input.colorName,
    secondary_colors: input.secondaryColors,
    secondary_color_names: input.secondaryColorNames,
    pattern: input.pattern,
    seasons: input.seasons,
    style: input.style,
    image_path: path,
  }).select("*").single();
  if (error) throw error;
  const urls = await signPaths([path]);
  cache = [normalize(data, urls[path] ?? ""), ...cache];
  return cache;
}

export async function removeItem(id: string): Promise<ClothingItem[]> {
  const item = cache.find((i) => i.id === id);
  const { error } = await supabase.from("clothing_items").delete().eq("id", id);
  if (error) throw error;
  if (item?.imagePath) await supabase.storage.from(BUCKET).remove([item.imagePath]);
  cache = cache.filter((i) => i.id !== id);
  return cache;
}

export async function updateItem(updated: ClothingItem): Promise<ClothingItem[]> {
  const { error } = await supabase.from("clothing_items").update({
    name: updated.name,
    category: updated.category,
    primary_color: updated.primaryColor,
    color_name: updated.colorName,
    secondary_colors: updated.secondaryColors,
    secondary_color_names: updated.secondaryColorNames,
    pattern: updated.pattern,
    seasons: updated.seasons,
    style: updated.style,
  }).eq("id", updated.id);
  if (error) throw error;
  cache = cache.map((i) => (i.id === updated.id ? { ...updated } : i));
  return cache;
}

/** Migrate legacy items from IDB (v2) and localStorage (v1) into Cloud. Returns count migrated. */
export async function migrateLegacyItems(onProgress?: (done: number, total: number) => void): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const legacy: any[] = [];
  const seen = new Set<string>();
  const push = (arr: any[]) => {
    for (const it of arr ?? []) {
      if (!it || !it.imageDataUrl) continue;
      const key = it.id ?? it.imageDataUrl.slice(0, 128);
      if (seen.has(key)) continue;
      seen.add(key);
      legacy.push(it);
    }
  };

  // IDB v2
  try { push((await idbGet<any[]>(IDB_KEY)) ?? []); } catch { /* ignore */ }
  // IDB legacy keys
  for (const k of ["wardrobe.items.v1", "wardrobe.items", "wardrobe"]) {
    try { push((await idbGet<any[]>(k)) ?? []); } catch { /* ignore */ }
  }
  // localStorage v1
  if (typeof window !== "undefined") {
    for (const k of ["wardrobe.items.v1", "wardrobe.items", "wardrobe"]) {
      try {
        const raw = window.localStorage.getItem(k);
        if (raw) push(JSON.parse(raw));
      } catch { /* ignore */ }
    }
  }

  if (!legacy.length) return 0;
  let ok = 0;
  for (let i = 0; i < legacy.length; i++) {
    const it = legacy[i];
    try {
      await addItem({
        name: it.name ?? "Kıyafet",
        category: (it.category as Category) ?? "top",
        primaryColor: it.primaryColor ?? "#888888",
        colorName: it.colorName ?? "renk",
        secondaryColors: it.secondaryColors ?? [],
        secondaryColorNames: it.secondaryColorNames ?? [],
        pattern: (it.pattern as Pattern) ?? "solid",
        seasons: it.seasons ?? ["spring", "summer", "fall", "winter"],
        style: (it.style as Style) ?? "casual",
        imageDataUrl: it.imageDataUrl,
      });
      ok++;
    } catch { /* skip */ }
    onProgress?.(i + 1, legacy.length);
  }
  try { await idbDel(IDB_KEY); } catch { /* ignore */ }
  if (typeof window !== "undefined") {
    for (const k of ["wardrobe.items.v1", "wardrobe.items", "wardrobe"]) {
      try { window.localStorage.removeItem(k); } catch { /* ignore */ }
    }
  }
  return ok;
}


/* ---------- outfit generation (unchanged) ---------- */

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
