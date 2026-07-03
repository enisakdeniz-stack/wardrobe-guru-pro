import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Shirt, Sparkles, Trash2, Upload, Loader2, Wand2, X, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  addItem, currentSeason, generateOutfitsFor, labelCategory,
  labelPattern, labelSeason, labelStyle, loadItems, loadItemsAsync,
  removeItem, updateItem, migrateLegacyItems,
  type Category, type ClothingItem, type ColorMode, type Outfit,
  type Pattern, type Season, type Style,
} from "@/lib/wardrobe";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { LogOut } from "lucide-react";


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

async function downscaleImage(dataUrl: string, maxSize = 768): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.src = dataUrl;
  });
}



function EditModal({ item, onSave, onClose }: { item: ClothingItem; onSave: (u: ClothingItem) => void; onClose: () => void }) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState<Category>(item.category);
  const [style, setStyle] = useState<Style>(item.style);
  const [pattern, setPattern] = useState<Pattern>(item.pattern ?? "solid");
  const [seasons, setSeasons] = useState<Season[]>(item.seasons);
  const [primaryColor, setPrimaryColor] = useState(item.primaryColor);
  const [colorName, setColorName] = useState(item.colorName);
  const [secondaryColors, setSecondaryColors] = useState<string[]>(item.secondaryColors ?? []);
  const [secondaryColorNames, setSecondaryColorNames] = useState<string[]>(item.secondaryColorNames ?? []);
  const allSeasons: Season[] = ["spring", "summer", "fall", "winter"];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Kıyafeti Düzenle</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <img src={item.imageDataUrl} alt={item.name} className="w-full h-40 object-cover rounded-lg" />
          <div>
            <label className="text-xs font-medium text-muted-foreground">İsim</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Kategori</label>
              <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="top">Üst</SelectItem>
                  <SelectItem value="bottom">Alt</SelectItem>
                  <SelectItem value="dress">Elbise</SelectItem>
                  <SelectItem value="outerwear">Dış Giyim</SelectItem>
                  <SelectItem value="shoes">Ayakkabı</SelectItem>
                  <SelectItem value="accessory">Aksesuar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Stil</label>
              <Select value={style} onValueChange={(v) => setStyle(v as Style)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="casual">Günlük</SelectItem>
                  <SelectItem value="formal">Resmi</SelectItem>
                  <SelectItem value="sport">Spor</SelectItem>
                  <SelectItem value="elegant">Şık</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Desen</label>
            <Select value={pattern} onValueChange={(v) => setPattern(v as Pattern)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="solid">Düz</SelectItem>
                <SelectItem value="striped">Çizgili</SelectItem>
                <SelectItem value="checked">Kareli</SelectItem>
                <SelectItem value="floral">Çiçekli</SelectItem>
                <SelectItem value="graphic">Baskılı</SelectItem>
                <SelectItem value="other">Diğer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Mevsimler</label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {allSeasons.map((s) => (
                <button key={s} onClick={() => setSeasons((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])}
                  className={`px-3 py-1 rounded-full text-xs border transition ${seasons.includes(s) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
                  {labelSeason(s)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Ana Renk</label>
            <div className="flex gap-2 mt-1 items-center">
              <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-9 w-12 rounded cursor-pointer border border-border" />
              <Input value={colorName} onChange={(e) => setColorName(e.target.value)} placeholder="Renk adı" className="flex-1" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">İkincil Renkler</label>
              {secondaryColors.length < 3 && (
                <button onClick={() => { setSecondaryColors([...secondaryColors, "#888888"]); setSecondaryColorNames([...secondaryColorNames, "renk"]); }} className="text-xs text-primary hover:underline">+ Renk ekle</button>
              )}
            </div>
            <div className="space-y-2 mt-1">
              {secondaryColors.map((color, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input type="color" value={color} onChange={(e) => { const u = [...secondaryColors]; u[i] = e.target.value; setSecondaryColors(u); }} className="h-9 w-12 rounded cursor-pointer border border-border" />
                  <Input value={secondaryColorNames[i] ?? ""} onChange={(e) => { const u = [...secondaryColorNames]; u[i] = e.target.value; setSecondaryColorNames(u); }} placeholder="Renk adı" className="flex-1" />
                  <button onClick={() => { setSecondaryColors(secondaryColors.filter((_, j) => j !== i)); setSecondaryColorNames(secondaryColorNames.filter((_, j) => j !== i)); }} className="text-muted-foreground hover:text-destructive"><X className="size-4" /></button>
                </div>
              ))}
              {secondaryColors.length === 0 && <p className="text-xs text-muted-foreground">Desenli kıyafetler için ekle.</p>}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>İptal</Button>
            <Button className="flex-1" onClick={() => {
              if (!seasons.length) { toast.error("En az bir mevsim seç"); return; }
              onSave({ ...item, name, category, style, pattern, seasons, primaryColor, colorName, secondaryColors, secondaryColorNames });
            }}>
              <Check className="size-4 mr-1" /> Kaydet
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email || password.length < 6) { toast.error("Email ve en az 6 karakterli şifre gir"); return; }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        toast.success("Hesap oluşturuldu — giriş yapılıyor");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background p-4">
      <Toaster richColors position="top-center" />
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-xl bg-primary text-primary-foreground grid place-items-center"><Shirt className="size-5" /></div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Dolabım</h1>
              <p className="text-xs text-muted-foreground">{mode === "signin" ? "Giriş yap" : "Hesap oluştur"}</p>
            </div>
          </div>
          <div className="space-y-2">
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input type="password" placeholder="Şifre (min 6)" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button className="w-full" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
            {mode === "signin" ? "Giriş yap" : "Kayıt ol"}
          </Button>
          <button className="text-xs text-muted-foreground hover:text-foreground w-full text-center" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
            {mode === "signin" ? "Hesabın yok mu? Kayıt ol" : "Hesabın var mı? Giriş yap"}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [editingItem, setEditingItem] = useState<ClothingItem | null>(null);
  const [season, setSeason] = useState<Season>(currentSeason());
  const [colorMode, setColorMode] = useState<ColorMode>("contrast");
  const [styleFilter, setStyleFilter] = useState<Style | "any">("any");
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [seedId, setSeedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"outfits" | "wardrobe">("wardrobe");
  const [catFilter, setCatFilter] = useState<Category | "all">("all");
  const [migrating, setMigrating] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setSessionReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setItems([]); return; }
    loadItemsAsync().then(setItems).catch((e) => toast.error(e.message));
  }, [session?.user?.id]);

  async function handleMigrate() {
    setMigrating(true);
    const tId = toast.loading("Eski kıyafetler taşınıyor...");
    try {
      const n = await migrateLegacyItems((done, total) => toast.loading(`${done}/${total} taşınıyor...`, { id: tId }));
      toast.success(n > 0 ? `${n} kıyafet taşındı` : "Taşınacak eski kıyafet bulunamadı", { id: tId });
      setItems(await loadItemsAsync());
    } catch (e) { toast.error((e as Error).message, { id: tId }); }
    finally { setMigrating(false); }
  }

  async function analyzeOne(small: string, attempt = 0): Promise<Response> {
    const res = await fetch("/api/analyze-clothing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageDataUrl: small }) });
    if ((res.status === 429 || res.status === 503) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 1500 * Math.pow(2, attempt)));
      return analyzeOne(small, attempt + 1);
    }
    return res;
  }
    const res = await fetch("/api/analyze-clothing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageDataUrl: small }) });
    if ((res.status === 429 || res.status === 503) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 1500 * Math.pow(2, attempt)));
      return analyzeOne(small, attempt + 1);
    }
    return res;
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setAnalyzing(true);
    const arr = Array.from(files);
    let ok = 0, fail = 0;
    const tId = toast.loading(`0/${arr.length} analiz ediliyor...`);
    try {
      for (let i = 0; i < arr.length; i++) {
        const file = arr[i];
        toast.loading(`${i + 1}/${arr.length} analiz ediliyor: ${file.name}`, { id: tId });
        try {
          const raw = await fileToDataUrl(file);
          const small = await downscaleImage(raw);
          const res = await analyzeOne(small);
          if (!res.ok) { fail++; toast.error(`${file.name}: ${(await res.text()).slice(0, 100)}`); await new Promise((r) => setTimeout(r, 800)); continue; }
          const data = await res.json();
          const next = await addItem({
            name: data.name ?? "Kıyafet",
            category: data.category ?? "top",
            primaryColor: data.primaryColor ?? "#888888",
            colorName: data.colorName ?? "renk",
            secondaryColors: data.secondaryColors ?? [],
            secondaryColorNames: data.secondaryColorNames ?? [],
            pattern: data.pattern ?? "solid",
            seasons: data.seasons?.length ? data.seasons : ["spring", "summer", "fall", "winter"],
            style: data.style ?? "casual",
            imageDataUrl: small,
          });
          setItems(next); ok++;
          if (i < arr.length - 1) await new Promise((r) => setTimeout(r, 350));
        } catch (e) { fail++; toast.error(`${file.name}: ${(e as Error).message}`); }
      }
      toast.success(`${ok} eklendi${fail ? `, ${fail} başarısız` : ""}`, { id: tId });
    } finally {
      setAnalyzing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    setItems(await removeItem(id));
    if (seedId === id) { setSeedId(null); setOutfits([]); }
    toast("Silindi");
  }

  async function handleSaveEdit(updated: ClothingItem) {
    const next = await updateItem(updated);
    setItems(next); setEditingItem(null); toast.success("Kaydedildi");
    if (seedId === updated.id) setOutfits(generateOutfitsFor(updated, next, { season, colorMode, style: styleFilter, count: 3 }));
  }

  function startCombineWith(item: ClothingItem) {
    setSeedId(item.id); setTab("outfits");
    const result = generateOutfitsFor(item, loadItems(), { season, colorMode, style: styleFilter, count: 3 });
    setOutfits(result);
    if (!result.length) toast.error("Bu parçayla uygun kombin bulunamadı.");
  }

  function handleGenerate() {
    const seed = items.find((i) => i.id === seedId);
    if (!seed) { toast.error("Önce dolabından bir parça seç"); setTab("wardrobe"); return; }
    const result = generateOutfitsFor(seed, items, { season, colorMode, style: styleFilter, count: 3 });
    setOutfits(result);
    if (!result.length) toast.error("Bu kriterlere uygun kombin bulunamadı.");
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-center" />
      {editingItem && <EditModal item={editingItem} onSave={handleSaveEdit} onClose={() => setEditingItem(null)} />}

      <header className="border-b border-border/60 bg-card/40 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-2">
          <div className="size-9 rounded-xl bg-primary text-primary-foreground grid place-items-center">
            <Shirt className="size-5" />
          </div>
          <div className="flex-1">
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
              if (!seed) return (
                <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                  Dolabından bir parça seç, ona göre kombin üretelim.
                  <div className="mt-4"><Button variant="outline" onClick={() => setTab("wardrobe")}>Dolabıma git</Button></div>
                </div>
              );
              return (
                <Card><CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <img src={seed.imageDataUrl} alt={seed.name} className="size-16 rounded-lg object-cover border border-border" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">Seçili parça</p>
                      <p className="font-medium truncate">{seed.name}</p>
                      <p className="text-xs text-muted-foreground">{labelCategory(seed.category)} · {seed.colorName}</p>
                      {(seed.secondaryColors?.length ?? 0) > 0 && (
                        <div className="flex gap-1 mt-1">{seed.secondaryColors.map((c, i) => <span key={i} className="size-3 rounded-full border border-background shadow" style={{ backgroundColor: c }} />)}</div>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => { setSeedId(null); setOutfits([]); }}><X className="size-4" /></Button>
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
                      <Button className="w-full" onClick={handleGenerate}><Sparkles className="size-4 mr-2" />Yeniden üret</Button>
                    </div>
                  </div>
                </CardContent></Card>
              );
            })()}
            {outfits.length === 0 ? (seedId && (
              <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                Bu parçayla uygun kombin bulunamadı.
              </div>
            )) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {outfits.map((o) => (
                  <Card key={o.id}><CardContent className="pt-6">
                    <div className="flex flex-wrap gap-2 mb-3">
                      {o.items.map((it) => (
                        <div key={it.id} className="relative">
                          <img src={it.imageDataUrl} alt={it.name} className="size-20 rounded-lg object-cover border border-border" />
                          <span className="absolute -bottom-1 -right-1 size-4 rounded-full border-2 border-background" style={{ backgroundColor: it.primaryColor }} />
                        </div>
                      ))}
                    </div>
                    <p className="text-sm font-medium">{o.reason}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {o.items.map((it) => (<Badge key={it.id} variant="secondary" className="text-xs">{labelCategory(it.category)}: {it.name}</Badge>))}
                    </div>
                  </CardContent></Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="wardrobe" className="mt-4 space-y-4">
            <Card><CardContent className="pt-6">
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
              <Button onClick={() => fileRef.current?.click()} disabled={analyzing} className="w-full" size="lg">
                {analyzing ? <><Loader2 className="size-4 mr-2 animate-spin" />AI analiz ediyor...</> : <><Upload className="size-4 mr-2" />Kıyafet fotoğrafı ekle</>}
              </Button>
              <p className="text-xs text-muted-foreground mt-2 text-center">AI fotoğraftan türü, rengini ve mevsimi otomatik tespit eder.</p>
            </CardContent></Card>

            {items.length > 0 && (
              <div className="-mx-4 px-4 overflow-x-auto scrollbar-none">
                <div className="flex gap-2 w-max pb-1">
                  {([
                    ["all", "Tümü"],
                    ["top", "Üst"],
                    ["bottom", "Alt"],
                    ["outerwear", "Dış Giyim"],
                    ["shoes", "Ayakkabı"],
                    ["dress", "Elbise"],
                    ["accessory", "Aksesuar"],
                  ] as [Category | "all", string][]).map(([val, label]) => {
                    const count = val === "all" ? items.length : items.filter((i) => i.category === val).length;
                    const active = catFilter === val;
                    return (
                      <button
                        key={val}
                        onClick={() => setCatFilter(val)}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition ${active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
                      >
                        {label} <span className={`ml-1 ${active ? "opacity-80" : "opacity-60"}`}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                <Shirt className="size-6 mx-auto mb-2 opacity-50" />
                Henüz kıyafet eklemedin.
              </div>
            ) : (() => {
              const filtered = catFilter === "all" ? items : items.filter((i) => i.category === catFilter);
              if (filtered.length === 0) return (
                <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                  Bu kategoride kıyafet yok.
                </div>
              );
              return (
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
                {filtered.map((it) => (
                  <Card key={it.id} className="overflow-hidden">
                    <div className="relative aspect-square">
                      <img src={it.imageDataUrl} alt={it.name} className="size-full object-cover" />
                      <div className="absolute top-2 right-2 flex gap-1">
                        <button onClick={() => setEditingItem(it)} className="size-7 rounded-full bg-background/80 backdrop-blur grid place-items-center hover:bg-primary hover:text-primary-foreground"><Pencil className="size-3.5" /></button>
                        <button onClick={() => handleDelete(it.id)} className="size-7 rounded-full bg-background/80 backdrop-blur grid place-items-center hover:bg-destructive hover:text-destructive-foreground"><Trash2 className="size-3.5" /></button>
                      </div>
                      <div className="absolute bottom-2 left-2 flex gap-1">
                        <span className="size-5 rounded-full border-2 border-background shadow" style={{ backgroundColor: it.primaryColor }} />
                        {it.secondaryColors?.map((c, i) => <span key={i} className="size-5 rounded-full border-2 border-background shadow" style={{ backgroundColor: c }} />)}
                      </div>
                    </div>
                    <CardContent className="p-3 space-y-2">
                      <div>
                        <p className="text-sm font-medium truncate">{it.name}</p>
                        <p className="text-xs text-muted-foreground">{labelCategory(it.category)} · {labelStyle(it.style)} · {labelPattern(it.pattern ?? "solid")}</p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {it.seasons.map((s) => <Badge key={s} variant="outline" className="text-[10px] px-1.5 py-0">{labelSeason(s)}</Badge>)}
                      </div>
                      <Button size="sm" className="w-full" onClick={() => startCombineWith(it)}>
                        <Wand2 className="size-3.5 mr-1.5" /> Kombin üret
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
              );
            })()}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
