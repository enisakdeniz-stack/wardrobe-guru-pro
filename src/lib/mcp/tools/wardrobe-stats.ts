import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "wardrobe_stats",
  title: "Dolap istatistikleri",
  description:
    "Kullanıcının dolabındaki kıyafetlerin kategori, mevsim ve stil dağılımını özetler.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Kimlik doğrulanmadı." }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("clothing_items")
      .select("category,style,seasons,color_name");
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    const byCategory: Record<string, number> = {};
    const byStyle: Record<string, number> = {};
    const bySeason: Record<string, number> = {};
    const byColor: Record<string, number> = {};
    for (const r of data ?? []) {
      byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
      byStyle[r.style] = (byStyle[r.style] ?? 0) + 1;
      byColor[r.color_name] = (byColor[r.color_name] ?? 0) + 1;
      if (Array.isArray(r.seasons)) {
        for (const s of r.seasons as string[]) bySeason[s] = (bySeason[s] ?? 0) + 1;
      }
    }
    const total = data?.length ?? 0;
    return {
      content: [{ type: "text", text: `Toplam ${total} kıyafet.` }],
      structuredContent: { total, byCategory, byStyle, bySeason, byColor },
    };
  },
});
