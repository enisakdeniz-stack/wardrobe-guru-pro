import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listClothesTool from "./tools/list-clothes";
import wardrobeStatsTool from "./tools/wardrobe-stats";

// OAuth issuer must be the direct Supabase host (not the .lovable.cloud proxy).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "dolabim-mcp",
  title: "Dolabım MCP",
  version: "0.1.0",
  instructions:
    "Dolabım uygulamasındaki kıyafetlerinize erişim sağlar. list_clothes ile kıyafetleri listeleyin, wardrobe_stats ile özet alın.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listClothesTool, wardrobeStatsTool],
});
