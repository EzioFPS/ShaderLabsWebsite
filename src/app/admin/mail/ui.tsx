// Small presentational pieces for the inbox (usable on the server and in the browser).

const ICONS: Record<string, string> = {
  inbox: "M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6H3v-6l2-8z",
  starred: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z",
  sent: "M4 12l16-8-6 16-2.5-6.5L4 12z",
  archive: "M3 5h18v4H3V5zm2 4h14v10H5V9zm5 4h4",
  spam: "M12 3l9 16H3l9-16zm0 6v4m0 3v.5",
  trash: "M4 7h16M9 7V4h6v3m-8 0l1 13h8l1-13",
  reply: "M10 8L4 13l6 5v-3c5 0 8 1 10 5-1-6-4-9-10-9V8z",
  replyall: "M9 8l-5 5 5 5M14 8l-6 5 6 5v-3c4 0 6 1 7 4-1-5-3-8-7-8V8z",
  forward: "M14 8l6 5-6 5v-3c-5 0-8 1-10 5 1-6 4-9 10-9V8z",
  unread: "M3 6h18v12H3V6zm0 0l9 7 9-7",
  attach: "M16 7l-7.5 7.5a2.5 2.5 0 003.5 3.5L19 11a4.5 4.5 0 00-6.4-6.4L5 12.2a6.5 6.5 0 009.2 9.2L20 15.6",
  back: "M15 5l-7 7 7 7",
  refresh: "M20 11a8 8 0 10-2.3 5.7M20 4v7h-7",
  pen: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
};

export function Icon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`flex-none ${className}`}
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

const TINTS = ["#c6ff3d", "#7dd3fc", "#fca5a5", "#fcd34d", "#a7f3d0", "#c4b5fd", "#f9a8d4", "#fdba74"];

export function Avatar({ name, address, size = "h-9 w-9 text-sm" }: { name?: string | null; address: string; size?: string }) {
  const label = (name || address).replace(/[^A-Za-z0-9]/g, "").slice(0, 1).toUpperCase() || "?";
  let h = 0;
  for (const c of address) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span
      className={`inline-flex flex-none items-center justify-center rounded-full font-semibold text-ink ${size}`}
      style={{ background: TINTS[h % TINTS.length] }}
      aria-hidden="true"
    >
      {label}
    </span>
  );
}

export const sizeLabel = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
