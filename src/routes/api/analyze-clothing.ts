import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/analyze-clothing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        const { imageDataUrl } = (await request.json()) as { imageDataUrl: string };
        if (!imageDataUrl) return new Response("Missing image", { status: 400 });

        const systemPrompt = `Sen bir moda asistanısın. Verilen kıyafet fotoğrafını analiz et ve SADECE şu JSON şemasında cevap ver, ek metin yok:
{
  "name": "kısa Türkçe isim, örn: Mavi çizgili gömlek",
  "category": "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory",
  "primaryColor": "#RRGGBB formatında EN dominant renk",
  "colorName": "Türkçe dominant renk adı (lacivert, krem, vb)",
  "secondaryColors": ["#RRGGBB", "#RRGGBB"] (varsa diğer belirgin renkler, yoksa boş dizi []),
  "secondaryColorNames": ["Türkçe renk adı"] (secondaryColors ile aynı sırada, yoksa boş dizi []),
  "seasons": ["spring" | "summer" | "fall" | "winter"] (uygun mevsimler),
  "style": "casual" | "formal" | "sport" | "elegant",
  "pattern": "solid" | "striped" | "checked" | "floral" | "graphic" | "other"
}

Önemli kurallar:
- Desenli kıyafetlerde (çizgili, kareli, çiçekli vb.) tüm belirgin renkleri secondaryColors dizisine ekle
- secondaryColors en fazla 3 renk içersin
- Işık/gölge nedeniyle oluşan ton farklarını ayrı renk sayma
- JSON dışında hiçbir şey yazma`;

        const body = {
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: "Bu kıyafeti analiz et." },
                { type: "image_url", image_url: { url: imageDataUrl } },
              ],
            },
          ],
        };

        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const text = await res.text();
          return new Response(text, { status: res.status });
        }

        const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
        let content = data.choices?.[0]?.message?.content ?? "{}";
        content = content.replace(/```json\s*/g, "").replace(/```\s*$/g, "").trim();

        try {
          const parsed = JSON.parse(content);
          // Ensure arrays exist
          if (!Array.isArray(parsed.secondaryColors)) parsed.secondaryColors = [];
          if (!Array.isArray(parsed.secondaryColorNames)) parsed.secondaryColorNames = [];
          return Response.json(parsed);
        } catch {
          return new Response(`Failed to parse: ${content}`, { status: 502 });
        }
      },
    },
  },
});
