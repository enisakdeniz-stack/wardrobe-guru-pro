import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/analyze-clothing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.GEMINI_API_KEY;
        if (!key) return new Response("Missing GEMINI_API_KEY", { status: 500 });

        const { imageDataUrl } = (await request.json()) as { imageDataUrl: string };
        if (!imageDataUrl) return new Response("Missing image", { status: 400 });

        const base64Match = imageDataUrl.match(/^data:(.+);base64,(.+)$/);
        if (!base64Match) return new Response("Invalid image format", { status: 400 });
        const mimeType = base64Match[1];
        const base64Data = base64Match[2];

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
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64Data } }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 500 }
        };

        const res = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-goog-api-key": key,
            },
            body: JSON.stringify(body),
          }
        );

        if (!res.ok) {
          const text = await res.text();
          return new Response(text, { status: res.status });
        }

        const data = await res.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
        let content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
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
