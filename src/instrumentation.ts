// Runs once when the server starts.
// Render's free plan puts a site to sleep after 15 minutes without incoming requests, and the
// next visitor sees Render's "waking up" page. On Render, the server pings its own public
// address every 10 minutes (through Render's proxy, so it counts as traffic) to stay awake.
const KEEP_AWAKE_MS = 10 * 60 * 1000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const url = process.env.RENDER_EXTERNAL_URL; // set by Render, e.g. https://shaderlabs-web.onrender.com
  if (!url) return;

  setInterval(() => {
    fetch(`${url}/robots.txt`, { cache: "no-store" }).catch(() => {
      // A missed ping is harmless; the next one runs in 10 minutes.
    });
  }, KEEP_AWAKE_MS);
}
