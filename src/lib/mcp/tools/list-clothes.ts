import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_clothes",
  title: "Kıyafetlerimi listele",
  description:
    "Kullanıcının dolabındaki tüm kıyafetleri döndürür (kategori, renk, mevsim, stil, desen).",
  inputSchema: {
    category: z
      .enum(["top", "bottom", "dress", "outerwear", "shoes", "accessory"])
      .optional()
      .describe("Filtrelemek için kategori (opsiyonel)."),
    season: z
      .enum(["spring", "summer", "fall", "winter"])
      .optional()
      .describe("Filtrelemek için mevsim (opsiyonel)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ category, season }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Kimlik doğrulanmadı." }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    let query = sb
      .from("clothing_items")
      .select("id,name,category,primary_color,color_name,pattern,seasons,style,created_at")
      .order("created_at", { ascending: false });
    if (category) query = query.eq("category", category);
    const { data, error } = await query;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    const rows = (data ?? []).filter((r) =>
      season ? Array.isArray(r.seasons) && (r.seasons as string[]).includes(season) : true,
    );
    return {
      content: [{ type: "text", text: `${rows.length} kıyafet bulundu.` }],
      structuredContent: { count: rows.length, items: rows },
    };
  },
});
