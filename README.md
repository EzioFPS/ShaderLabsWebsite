# Shader Labs website

Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Prisma + Postgres · Resend (email) · Lenis + GSAP · WebGL shaders

## Pages

| Path | What |
| --- | --- |
| `/` | Home: dithered-planet shader hero, what we do, selected work, featured case study, process, founders |
| `/services` | Eight services, embedded-team model, process |
| `/work`, `/work/[slug]` | Work index (clients + own products) and case studies (Whole Story Distribution, Artist Vanguard) |
| `/about` | What we bring, principles, founders, company details |
| `/contact` | Contact form → saved to the database + emailed to mail@shaderlabs.in |
| `/admin` | Password-protected inbox of enquiries (search, status, CSV export) |

`/products` redirects to `/work`. All copy lives in `src/lib/content.ts` (founder photos: set `photo` there and put the file in `public/team/`).

## Code map

- `src/components/Motion.tsx`: Lenis smooth scroll + every GSAP scroll animation (`data-lines`, `data-reveal`, `data-wipe`, `data-parallax`, `data-rise`)
- `src/components/Loader.tsx`: once-per-session "compiling shaders" loading screen
- `src/components/ShaderCanvas.tsx`: hero planet (WebGL, ordered dithering)
- `src/components/SphereTrail.tsx`: looping pixel-built spheres in the footer logo
- `src/components/Logo.tsx`: the logo as vector art (`animated` swaps in SphereTrail)
- `src/app/globals.css`: design tokens, type scale, motion start states

## Run locally

```bash
npm install
cp .env.example .env   # then fill in values (already done on this machine)
npm run dev            # http://localhost:3000 (creates/updates the DB automatically)
```

Production mode: `npm run build` then `npm start`. `npm run dev:alt` runs a second dev server on port 3001 with its own build folder (`.next-dev`), so it can run next to production.

## Environment (`.env`)

- `DATABASE_URL`: Postgres connection string ([Neon](https://neon.tech) free tier; turn connection pooling off when copying it)
- `RESEND_API_KEY`: API key from [resend.com](https://resend.com) (free tier: 3,000 emails/month). **Empty = emails are skipped**, enquiries are still saved and visible in `/admin`.
- `MAIL_FROM`: sender on the verified domain, `Shader Labs Website <website@shaderlabs.in>`
- `CONTACT_TO`: where enquiries are sent (default `mail@shaderlabs.in`)
- `ADMIN_PASSWORD`: password for `/admin`
- `ADMIN_SECRET`: random string that signs the admin session cookie
- `SITE_URL`: public URL of the site (SEO metadata, secure admin cookie)

## Hosting on Render (free)

`render.yaml` is a Render Blueprint: Dashboard → New → Blueprint → pick this repo, then fill in the values it asks for. Free plan, Singapore region; the database lives on Neon so enquiries survive restarts and deploys.

Free Render sites sleep after 15 minutes idle. `src/instrumentation.ts` keeps it awake: on Render, the server pings its own public URL every 10 minutes. `.github/workflows/keep-awake.yml` is a backup that wakes it if it ever does sleep (GitHub runs scheduled jobs only every few hours in practice; it uses the repo variable `SITE_URL`).
