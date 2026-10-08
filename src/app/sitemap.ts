import type { MetadataRoute } from "next";
import { caseStudies } from "@/lib/content";

export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.SITE_URL || "https://shaderlabs.in";
  const paths = ["", "/services", "/work", "/about", "/contact", ...caseStudies.map((c) => `/work/${c.slug}`)];
  return paths.map((p) => ({ url: `${site}${p}`, lastModified: new Date() }));
}
