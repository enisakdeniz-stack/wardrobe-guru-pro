import { createFileRoute } from "@tanstack/react-router";

const SYSTEM_PROMPT = `Sen bir moda asistanısın. Verilen kıyafet fotoğrafını analiz et ve SADECE şu JSON şemasında cevap ver, ek metin yok:
{
  "name": "kısa Türkçe isim, örn: Mavi çizgili gömlek",
  "category": "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory",
  "primaryColor": "#RRGGBB formatında EN dominant renk",
  "colorName": "Türkçe dominant renk adı (lacivert, krem, vb)",
  "secondaryColors": ["#RRGGBB"] (varsa diğer belirgin renkler, yoksa boş dizi []),
  "secondaryColorNames": ["Türkçe renk adı"] (secondaryColors ile aynı sırada, yoksa boş dizi []),
  "seasons": ["spring" | "summer" | "fall" | "winter"] (uygun mevsimler),
  "style": "casual" | "formal" | "sport" | "elegant",
  "pattern": "solid" | "striped" | "checked" | "floral" | "graphic" | "other"
}

Önemli kurallar:
- Desenli kıyafetlerde (çizgili, kareli, çiçekli vb.) tüm belirgin renkleri secondaryColors dizisine ekle (en fazla 3)
- Işık/gölge nedeniyle oluşan ton farklarını ayrı renk sayma
- JSON dışında hiçbir şey yazma`;

function parseResult(raw: string): Response {
  const content = raw.replace(/```json\s*/g, "").replace(/```\s*$/g, "").trim();
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.secondaryColors)) parsed.secondaryColors = [];
    if (!Array.isArray(parsed.secondaryColorNames)) parsed.secondaryColorNames = [];
    return Response.json(parsed);
  } catch {
    return new Response(`Failed to parse: ${content}`, { status: 502 });
  }
}

// OpenAI-compatible chat completions call (Lovable gateway + OpenRouter)
async function callChatApi(
  url: string,
  key: string,
  model: string,
  imageDataUrl: string,
): Promise<Response> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Bu kıyafeti analiz et." },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    return new Response(text, { status: res.status });
  }
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return parseResult(data.choices?.[0]?.message?.content ?? "{}");
}

export const Route = createFileRoute("/api/analyze-clothing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { imageDataUrl } = (await request.json()) as { imageDataUrl: string };
        if (!imageDataUrl) return new Response("Missing image", { status: 400 });

        // Provider 1: Lovable AI gateway (works on Lovable hosting)
        const lovableKey = process.env.LOVABLE_API_KEY;
        if (lovableKey) {
          return callChatApi(
            "https://ai.gateway.lovable.dev/v1/chat/completions",
            lovableKey,
            "google/gemini-2.5-flash",
            imageDataUrl,
          );
        }

        // Provider 2: OpenRouter (works on Vercel, free tier)
        const openrouterKey = process.env.OPENROUTER_API_KEY;
        if (openrouterKey) {
          return callChatApi(
            "https://openrouter.ai/api/v1/chat/completions",
            openrouterKey,
            "google/gemini-2.0-flash-exp:free",
            imageDataUrl,
          );
        }

        return new Response(
          "No AI provider configured (LOVABLE_API_KEY or OPENROUTER_API_KEY required)",
          { status: 500 },
        );
      },
    },
  },
});
