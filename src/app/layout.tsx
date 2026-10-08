import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono, Newsreader } from "next/font/google";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Loader } from "@/components/Loader";
import { Motion } from "@/components/Motion";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });
const serif = Newsreader({ subsets: ["latin"], style: ["italic"], variable: "--font-newsreader", display: "swap" });

const siteUrl = process.env.SITE_URL || "https://shaderlabs.in";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Shader Labs | Forward-deployed engineers for problems that can't wait",
    template: "%s | Shader Labs",
  },
  description:
    "Shader Labs builds custom tech for companies: websites, backends, custom pipelines, CRM systems and portals, for clients worldwide.",
  openGraph: {
    type: "website",
    siteName: "Shader Labs",
    locale: "en_US",
    url: siteUrl,
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${mono.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        {/* `js`: enables reveal animations only when JS runs, so content is never hidden without it.
            `is-loading` / `has-loader`: show the shader loader once per session (skipped for reduced motion). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var d=document.documentElement;d.classList.add('js');try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches&&!sessionStorage.getItem('sl-loaded')){d.classList.add('is-loading','has-loader')}}catch(e){}})()",
          }}
        />
      </head>
      <body>
        <Loader />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:bg-fg focus:px-4 focus:py-2 focus:text-ink"
        >
          Skip to content
        </a>
        <Header />
        <main id="main">{children}</main>
        <Footer />
        <Motion />
      </body>
    </html>
  );
}
