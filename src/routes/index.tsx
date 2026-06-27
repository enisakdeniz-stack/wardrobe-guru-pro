import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Shirt, Sparkles, Trash2, Upload, Loader2, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import {
  addItem,
  currentSeason,
  generateOutfitsFor,
  labelCategory,
  labelMode,
  labelSeason,
  labelStyle,
  loadItems,
  removeItem,
  type ClothingItem,
  type ColorMode,
  type Outfit,
  type Season,
  type Style,
} from "@/lib/wardrobe";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dolabım — AI Kombin Asistanı" },
      { name: "description", content: "Dolabındaki kıyafetleri ekle, AI mevsime ve renk uyumuna göre kombin önersin." },
    ],
  }),
  component: Home,
});

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Downscale to keep payload reasonable
async function downscaleImage(dataUrl: string, maxSize = 768): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.src = dataUrl;
  });
}

function Home() {
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [season, setSeason] = useState<Season>(currentSeason());
  const [colorMode, setColorMode] = useState<ColorMode>("contrast");
  const [styleFilter, setStyleFilter] = useState<Style | "any">("any");
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [seedId, setSeedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"outfits" | "wardrobe">("wardrobe");


  useEffect(() => {
    loadItemsAsync().then(setItems);
  }, []);

  async function analyzeOne(small: string, attempt = 0): Promise<Response> {
    const res = await fetch("/api/analyze-clothing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl: small }),
    });
    if ((res.status === 429 || res.status === 503) && attempt < 4) {
      const wait = 1500 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, wait));
      return analyzeOne(small, attempt + 1);
    }
    return res;
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setAnalyzing(true);
    const arr = Array.from(files);
    let ok = 0;
    let fail = 0;
    const tId = toast.loading(`0/${arr.length} analiz ediliyor...`);
    try {
      for (let i = 0; i < arr.length; i++) {
        const file = arr[i];
        toast.loading(`${i + 1}/${arr.length} analiz ediliyor: ${file.name}`, { id: tId });
        try {
          const raw = await fileToDataUrl(file);
          const small = await downscaleImage(raw);
          const res = await analyzeOne(small);
          if (!res.ok) {
            const txt = await res.text();
            fail++;
            toast.error(`${file.name}: ${txt.slice(0, 100)}`);
            // pause briefly so we don't hammer the gateway
            await new Promise((r) => setTimeout(r, 800));
            continue;
          }
          const data = await res.json();
          const item: ClothingItem = {
            id: crypto.randomUUID(),
            name: data.name ?? "Kıyafet",
            category: data.category ?? "top",
            primaryColor: data.primaryColor ?? "#888888",
            colorName: data.colorName ?? "renk",
            seasons: data.seasons?.length ? data.seasons : ["spring", "summer", "fall", "winter"],
            style: data.style ?? "casual",
            imageDataUrl: small,
            createdAt: Date.now(),
          };
          const next = addItem(item);
          setItems(next);
          ok++;
          // small delay between successful calls to respect rate limits
          if (i < arr.length - 1) await new Promise((r) => setTimeout(r, 350));
        } catch (e) {
          fail++;
          toast.error(`${file.name}: ${(e as Error).message}`);
        }
      }
      toast.success(`${ok} eklendi${fail ? `, ${fail} başarısız` : ""}`, { id: tId });
    } finally {
      setAnalyzing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleDelete(id: string) {
    const next = removeItem(id);
    setItems(next);
    if (seedId === id) setSeedId(null);
    setOutfits([]);
    toast("Silindi");
  }

  function startCombineWith(item: ClothingItem) {
    setSeedId(item.id);
    setTab("outfits");
    const result = generateOutfitsFor(item, loadItems(), { season, colorMode, style: styleFilter, count: 3 });
    setOutfits(result);
    if (result.length === 0) {
      toast.error("Bu parçayla uygun kombin bulunamadı. Dolaba daha çok parça ekle veya filtreyi yumuşat.");
    }
  }

  function handleGenerate() {
    const seed = items.find((i) => i.id === seedId);
    if (!seed) {
      toast.error("Önce dolabından bir parça seç");
      setTab("wardrobe");
      return;
    }
    const result = generateOutfitsFor(seed, items, { season, colorMode, style: styleFilter, count: 3 });
    setOutfits(result);
    if (result.length === 0) {
      toast.error("Bu kriterlere uygun kombin bulunamadı. Filtreyi yumuşat.");
    }
  }


  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-center" />
      <header className="border-b border-border/60 bg-card/40 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center gap-2">
          <div className="size-9 rounded-xl bg-primary text-primary-foreground grid place-items-center">
            <Shirt className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Dolabım</h1>
            <p className="text-xs text-muted-foreground">AI destekli kombin asistanı</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "outfits" | "wardrobe")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="wardrobe"><Shirt className="size-4 mr-2" />Dolabım ({items.length})</TabsTrigger>
            <TabsTrigger value="outfits"><Sparkles className="size-4 mr-2" />Kombinler</TabsTrigger>
          </TabsList>


          <TabsContent value="outfits" className="mt-4 space-y-4">
            {(() => {
              const seed = items.find((i) => i.id === seedId);
              if (!seed) {
                return (
                  <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                    Dolabından bir parça seç, ona göre 2-3 kombin üretelim.
                    <div className="mt-4">
                      <Button variant="outline" onClick={() => setTab("wardrobe")}>
                        Dolabıma git
                      </Button>
                    </div>
                  </div>
                );
              }
              return (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <img src={seed.imageDataUrl} alt={seed.name} className="size-16 rounded-lg object-cover border border-border" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">Seçili parça</p>
                        <p className="font-medium truncate">{seed.name}</p>
                        <p className="text-xs text-muted-foreground">{labelCategory(seed.category)} · {seed.colorName}</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => { setSeedId(null); setOutfits([]); }} aria-label="Temizle">
                        <X className="size-4" />
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-4 mt-4">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Mevsim</label>
                        <Select value={season} onValueChange={(v) => setSeason(v as Season)}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="spring">İlkbahar</SelectItem>
                            <SelectItem value="summer">Yaz</SelectItem>
                            <SelectItem value="fall">Sonbahar</SelectItem>
                            <SelectItem value="winter">Kış</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Renk uyumu</label>
                        <Select value={colorMode} onValueChange={(v) => setColorMode(v as ColorMode)}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="contrast">Kontrast</SelectItem>
                            <SelectItem value="analogous">Yakın renkler</SelectItem>
                            <SelectItem value="monochrome">Tek renk</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Stil</label>
                        <Select value={styleFilter} onValueChange={(v) => setStyleFilter(v as Style | "any")}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">Hepsi</SelectItem>
                            <SelectItem value="casual">Günlük</SelectItem>
                            <SelectItem value="formal">Resmi</SelectItem>
                            <SelectItem value="sport">Spor</SelectItem>
                            <SelectItem value="elegant">Şık</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-end">
                        <Button className="w-full" onClick={handleGenerate}>
                          <Sparkles className="size-4 mr-2" /> Yeniden üret
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {outfits.length === 0 ? (
              seedId && (
                <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                  Bu parçayla uygun kombin bulunamadı. Dolaba parça ekle veya filtreyi yumuşat.
                </div>
              )
            ) : (

              <div className="grid gap-4 sm:grid-cols-2">
                {outfits.map((o) => (
                  <Card key={o.id}>
                    <CardContent className="pt-6">
                      <div className="flex flex-wrap gap-2 mb-3">
                        {o.items.map((it) => (
                          <div key={it.id} className="relative">
                            <img
                              src={it.imageDataUrl}
                              alt={it.name}
                              className="size-20 rounded-lg object-cover border border-border"
                            />
                            <span
                              className="absolute -bottom-1 -right-1 size-4 rounded-full border-2 border-background"
                              style={{ backgroundColor: it.primaryColor }}
                            />
                          </div>
                        ))}
                      </div>
                      <p className="text-sm font-medium">{o.reason}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {o.items.map((it) => (
                          <Badge key={it.id} variant="secondary" className="text-xs">
                            {labelCategory(it.category)}: {it.name}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="wardrobe" className="mt-4 space-y-4">
            <Card>
              <CardContent className="pt-6">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <Button
                  onClick={() => fileRef.current?.click()}
                  disabled={analyzing}
                  className="w-full"
                  size="lg"
                >
                  {analyzing ? (
                    <><Loader2 className="size-4 mr-2 animate-spin" /> AI analiz ediyor...</>
                  ) : (
                    <><Upload className="size-4 mr-2" /> Kıyafet fotoğrafı ekle</>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  AI fotoğraftan türü, rengini ve mevsimi otomatik tespit eder.
                </p>
              </CardContent>
            </Card>

            {items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                <Shirt className="size-6 mx-auto mb-2 opacity-50" />
                Henüz kıyafet eklemedin.
              </div>
            ) : (
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
                {items.map((it) => (
                  <Card key={it.id} className="overflow-hidden group">
                    <div className="relative aspect-square">
                      <img src={it.imageDataUrl} alt={it.name} className="size-full object-cover" />
                      <button
                        onClick={() => handleDelete(it.id)}
                        className="absolute top-2 right-2 size-7 rounded-full bg-background/80 backdrop-blur grid place-items-center opacity-0 group-hover:opacity-100 transition hover:bg-destructive hover:text-destructive-foreground"
                        aria-label="Sil"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                      <span
                        className="absolute bottom-2 left-2 size-5 rounded-full border-2 border-background shadow"
                        style={{ backgroundColor: it.primaryColor }}
                      />
                    </div>
                    <CardContent className="p-3 space-y-2">
                      <div>
                        <p className="text-sm font-medium truncate">{it.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {labelCategory(it.category)} · {labelStyle(it.style)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {it.seasons.map((s) => (
                          <Badge key={s} variant="outline" className="text-[10px] px-1.5 py-0">
                            {labelSeason(s)}
                          </Badge>
                        ))}
                      </div>
                      <Button size="sm" className="w-full" onClick={() => startCombineWith(it)}>
                        <Wand2 className="size-3.5 mr-1.5" /> Kombin üret
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
