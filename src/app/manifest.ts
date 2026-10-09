import type { MetadataRoute } from "next";

// Makes the whole site installable from Chrome as a standalone app.
// The admin mail inbox keeps its own manifest (scope /admin/), linked from its page.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Shader Labs",
    short_name: "Shader Labs",
    description:
      "Shader Labs builds custom tech for companies: websites, backends, custom pipelines, CRM systems and portals, for clients worldwide.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b0b0a",
    theme_color: "#0b0b0a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
