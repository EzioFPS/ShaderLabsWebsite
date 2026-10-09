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

## Mailbox (mail@shaderlabs.in)

`/admin/mail` is the team inbox (same admin login). Resend receives mail for shaderlabs.in (MX → Resend inbound) and calls `/api/mail/inbound` (webhook event `email.received`, verified with `RESEND_WEBHOOK_SECRET`); the inbox also catches up from Resend's API when opened. Sending, replies and forwards go out through Resend. Everything is stored in Neon (`MailMessage`, `MailAttachment`). `RESEND_API_KEY` must be a **full access** key (receiving needs it).

The old Titan mailbox was copied in with `npm run import:titan` (IMAP, read-only; asks for the Titan password; `-- --scan` to only count). Re-running skips messages already imported.

## Hosting on Netlify (free)

Netlify builds the site from this repo on every push to `main` (settings in `netlify.toml`). Pages are served from Netlify's CDN and the contact form and `/admin` run as Netlify Functions, so nothing sleeps. The database lives on Neon. Set the environment variables listed above in Netlify: Project configuration → Environment variables.

The free plan has 300 credits a month (a production deploy is 15), so batch changes into occasional pushes rather than many small ones.
