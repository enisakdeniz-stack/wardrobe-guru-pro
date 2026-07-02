import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/analyze-clothing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const { imageDataUrl } = (await request.json()) as { imageDataUrl: string };
        if (!imageDataUrl) return new Response("Missing image", { status: 400 });

        const prompt = `Sen bir moda asistanısın. Verilen kıyafet fotoğrafını analiz et ve SADECE şu JSON formatında cevap ver, başka hiçbir şey yazma:
{
  "name": "kısa Türkçe isim (örn: Beyaz polo yaka tshirt)",
  "category": "top veya bottom veya dress veya outerwear veya shoes veya accessory",
  "primaryColor": "#RRGGBB formatında EN dominant renk hex kodu",
  "colorName": "Türkçe renk adı (örn: lacivert, krem, beyaz)",
  "secondaryColors": ["#RRGGBB varsa diğer belirgin renkler, yoksa boş dizi"],
  "secondaryColorNames": ["Türkçe renk adları, yoksa boş dizi"],
  "seasons": ["spring ve/veya summer ve/veya fall ve/veya winter"],
  "style": "casual veya formal veya sport veya elegant",
  "pattern": "solid veya striped veya checked veya floral veya graphic veya other"
}
Sadece JSON döndür, başka metin yazma.`;

        const body = {
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: imageDataUrl } },
              ],
            },
          ],
          temperature: 0.1,
          max_tokens: 500,
        };

        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${key}`,
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const text = await res.text();
          return new Response(text, { status: res.status });
        }

        const data = await res.json() as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        let content = data.choices?.[0]?.message?.content ?? "{}";
        content = content.replace(/```json\s*/g, "").replace(/```\s*$/g, "").trim();

        try {
          const parsed = JSON.parse(content);
          if (!Array.isArray(parsed.secondaryColors)) parsed.secondaryColors = [];
          if (!Array.isArray(parsed.secondaryColorNames)) parsed.secondaryColorNames = [];
          if (!parsed.subCategory) parsed.subCategory = "diger";
          return Response.json(parsed);
        } catch {
          return new Response(`Failed to parse: ${content}`, { status: 502 });
        }
      },
    },
  },
});
