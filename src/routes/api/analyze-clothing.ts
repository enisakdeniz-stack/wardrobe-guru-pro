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
  "name": "kısa Türkçe isim, örn: Mavi kot pantolon",
  "category": "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory",
  "primaryColor": "#RRGGBB formatında dominant renk",
  "colorName": "Türkçe renk adı (lacivert, krem, vb)",
  "seasons": ["spring" | "summer" | "fall" | "winter"] (uygun mevsimler, birden çok olabilir),
  "style": "casual" | "formal" | "sport" | "elegant"
}`;

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
        // Strip markdown fences if present
        content = content.replace(/```json\s*/g, "").replace(/```\s*$/g, "").trim();

        try {
          const parsed = JSON.parse(content);
          return Response.json(parsed);
        } catch {
          return new Response(`Failed to parse: ${content}`, { status: 502 });
        }
      },
    },
  },
});
