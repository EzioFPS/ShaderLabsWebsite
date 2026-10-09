"use client";

import Form from "next/form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  buildCompose,
  FOLDER_LABELS,
  FOLDERS,
  formatAddress,
  longDate,
  MAILBOX_ADDRESS,
  shortDate,
  type ComposeInit,
  type Folder,
  type ThreadMessage,
  type ThreadSummary,
} from "@/lib/mail-shared";
import { logout } from "../actions";
import { emptyTrash, syncNow, threadOp, type ThreadOp } from "./actions";
import { AppControls } from "./AppControls";
import { Compose } from "./Compose";
import { MailFrame } from "./MailFrame";
import { Avatar, Icon, sizeLabel } from "./ui";

type Props = {
  folder: Folder;
  query: string;
  threads: ThreadSummary[];
  moreHref: string | null;
  unread: Record<string, number>;
  initialKey: string | null;
  initialThread: ThreadMessage[] | null;
  initialCompose: ComposeInit | null;
  configured: boolean;
  pushKey: string | null;
};

const SYNC_EVERY_MS = 60_000;

export function MailApp(props: Props) {
  const { folder, query, configured } = props;
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [threads, setThreads] = useState(props.threads);
  const [unread, setUnread] = useState(props.unread);
  const [selected, setSelected] = useState<string | null>(props.initialKey);
  const [messages, setMessages] = useState<ThreadMessage[] | null>(props.initialThread);
  const [loadError, setLoadError] = useState(false);
  const [compose, setCompose] = useState<ComposeInit | null>(props.initialCompose);
  const [pendingFolder, setPendingFolder] = useState<Folder | null>(null);
  const [syncing, setSyncing] = useState(false);

  const cache = useRef(new Map<string, ThreadMessage[]>());
  const inflight = useRef(new Map<string, Promise<ThreadMessage[]>>());
  if (props.initialKey && props.initialThread && !cache.current.has(props.initialKey)) cache.current.set(props.initialKey, props.initialThread);

  // Fresh data from the server (after a refresh or a folder change) replaces the local copy.
  useEffect(() => setThreads(props.threads), [props.threads]);
  useEffect(() => setUnread(props.unread), [props.unread]);
  useEffect(() => setPendingFolder(null), [folder, query]);

  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);

  const urlFor = useCallback(
    (thread: string | null) => {
      const s = new URLSearchParams();
      if (folder !== "inbox") s.set("folder", folder);
      if (query) s.set("q", query);
      if (thread) s.set("thread", thread);
      const str = s.toString();
      return str ? `/admin/mail?${str}` : "/admin/mail";
    },
    [folder, query],
  );

  // ---------- loading conversations (cached, de-duplicated, preloaded on hover) ----------
  const fetchThread = useCallback((key: string) => {
    const hit = cache.current.get(key);
    if (hit) return Promise.resolve(hit);
    const running = inflight.current.get(key);
    if (running) return running;
    const p = fetch(`/admin/mail/thread?key=${encodeURIComponent(key)}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<{ messages: ThreadMessage[] }>;
      })
      .then(({ messages }) => {
        cache.current.set(key, messages);
        return messages;
      })
      .finally(() => inflight.current.delete(key));
    inflight.current.set(key, p);
    return p;
  }, []);

  const preload = (key: string) => {
    fetchThread(key).catch(() => {});
  };

  // Quietly preload the top of the list so the likely next opens are instant.
  useEffect(() => {
    let cancelled = false;
    const keys = props.threads.slice(0, 8).map((t) => t.threadKey);
    const timer = setTimeout(async () => {
      for (const key of keys) {
        if (cancelled || document.hidden) return;
        await fetchThread(key).catch(() => {});
      }
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [props.threads, fetchThread]);

  const selectedRef = useRef(selected);
  const show = useCallback(
    (key: string | null) => {
      setCompose(null);
      setSelected(key);
      selectedRef.current = key;
      setLoadError(false);
      if (!key) {
        setMessages(null);
        return;
      }
      const hit = cache.current.get(key);
      setMessages(hit ?? null);
      if (!hit)
        fetchThread(key)
          .then((m) => {
            if (selectedRef.current === key) setMessages(m); // ignore if another one was opened meanwhile
          })
          .catch(() => {
            if (selectedRef.current === key) setLoadError(true);
          });
    },
    [fetchThread],
  );

  const open = (t: ThreadSummary) => {
    show(t.threadKey);
    window.history.pushState(null, "", urlFor(t.threadKey));
    if (t.unread) {
      setThreads((list) => list.map((x) => (x.threadKey === t.threadKey ? { ...x, unread: false } : x)));
      setUnread((u) => ({ ...u, [folder]: Math.max(0, (u[folder] ?? 0) - 1) }));
      threadOp(t.threadKey, "read").then(refresh);
    }
  };

  const close = () => {
    show(null);
    window.history.pushState(null, "", urlFor(null));
  };

  // Browser back/forward moves between open conversations.
  useEffect(() => {
    const onPop = () => show(new URLSearchParams(window.location.search).get("thread"));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [show]);

  // ---------- new mail: check in the background, never block the page ----------
  useEffect(() => {
    if (!configured) return;
    let stopped = false;
    const run = async () => {
      if (document.hidden) return;
      const added = await syncNow();
      if (!stopped && added > 0) refresh();
    };
    const first = setTimeout(run, 1500);
    const timer = setInterval(run, SYNC_EVERY_MS);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [configured, refresh]);

  const checkNow = async () => {
    setSyncing(true);
    await syncNow(true);
    setSyncing(false);
    refresh();
  };

  // ---------- conversation actions: update the screen first, save in the background ----------
  const act = (op: ThreadOp, to?: string) => {
    const key = selected;
    if (!key) return;
    if (op === "delete" && !window.confirm("Delete this conversation forever?")) return;

    if (op === "star" || op === "unstar") {
      const starred = op === "star";
      setThreads((list) => list.map((x) => (x.threadKey === key ? { ...x, starred } : x)));
      setMessages((m) => m && m.map((x) => ({ ...x, starred })));
      const hit = cache.current.get(key);
      if (hit) cache.current.set(key, hit.map((x) => ({ ...x, starred })));
    } else {
      // unread, move and delete take the conversation out of view
      if (op === "unread") setThreads((list) => list.map((x) => (x.threadKey === key ? { ...x, unread: true } : x)));
      else if (!(folder === "starred" && to !== "trash")) setThreads((list) => list.filter((x) => x.threadKey !== key));
      cache.current.delete(key);
      close();
    }
    threadOp(key, op, to).then(refresh);
  };

  // Escape closes the open conversation or the compose window.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || (e.target as HTMLElement)?.closest("input,textarea")) return;
      if (compose) setCompose(null);
      else if (selected) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const startCompose = (mode: ComposeInit["mode"]) => {
    if (mode === "new") setCompose({ mode: "new" });
    else if (messages?.length) setCompose(buildCompose(mode, messages));
  };

  // ---------- view ----------
  const readerOpen = Boolean(compose || selected);
  const threadFolder = messages?.find((m) => m.direction === "in")?.folder ?? messages?.[0]?.folder;
  const threadStarred = Boolean(messages?.some((m) => m.starred));
  const listPending = pendingFolder !== null;

  const ToolButton = ({ op, to, label, icon, danger }: { op: ThreadOp; to?: string; label: string; icon: string; danger?: boolean }) => (
    <button
      type="button"
      title={label}
      onClick={() => act(op, to)}
      className={`inline-flex h-9 items-center gap-2 rounded-md px-2.5 text-sm transition-colors hover:bg-surface-2 ${danger ? "text-[#ffb3b3]" : "text-fg/80 hover:text-fg"}`}
    >
      <Icon name={icon} />
      <span className="hidden xl:inline">{label}</span>
    </button>
  );

  const replyButtons = (
    <>
      <button type="button" onClick={() => startCompose("reply")} className="btn btn-primary btn-sm h-9 gap-2">
        <Icon name="reply" /> Reply
      </button>
      <button type="button" onClick={() => startCompose("replyall")} className="btn btn-ghost btn-sm h-9 gap-2">
        <Icon name="replyall" /> Reply all
      </button>
      <button type="button" onClick={() => startCompose("forward")} className="btn btn-ghost btn-sm h-9 gap-2">
        <Icon name="forward" /> Forward
      </button>
    </>
  );

  const folderHref = (f: Folder) => (f === "inbox" ? "/admin/mail" : `/admin/mail?folder=${f}`);

  return (
    <section className="mail-app flex h-[100svh] flex-col pt-16">
      <div className="flex min-h-0 flex-1 border-t border-line">
        {/* ---------- sidebar ---------- */}
        <aside className="hidden w-60 flex-none flex-col border-r border-line bg-surface/60 lg:flex">
          <div className="p-4">
            <button type="button" onClick={() => startCompose("new")} className="btn btn-primary w-full justify-center gap-2">
              <Icon name="pen" /> Compose
            </button>
          </div>
          <nav aria-label="Folders" className="flex-1 overflow-y-auto px-2" data-lenis-prevent>
            <ul className="space-y-0.5">
              {FOLDERS.map((f) => {
                const active = (pendingFolder ?? folder) === f;
                const count = f === "inbox" || f === "spam" ? (unread[f] ?? 0) : 0;
                return (
                  <li key={f}>
                    <Link
                      href={folderHref(f)}
                      onClick={() => f !== folder && setPendingFolder(f)}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-[0.9375rem] transition-colors ${
                        active ? "bg-lime/12 font-semibold text-lime" : "text-fg/80 hover:bg-surface-2 hover:text-fg"
                      }`}
                    >
                      <Icon name={f} />
                      <span className="flex-1">{FOLDER_LABELS[f]}</span>
                      {count > 0 && <span className={`font-mono text-xs ${active ? "text-lime" : "text-fg"}`}>{count}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
            {folder === "trash" && threads.length > 0 && (
              <form action={emptyTrash} className="px-3 pt-3">
                <button type="submit" className="text-xs text-[#ffb3b3] hover:underline">
                  Empty trash
                </button>
              </form>
            )}
          </nav>
          <div className="space-y-1 border-t border-line p-3 text-sm">
            <AppControls pushKey={props.pushKey} />
            <p className="truncate px-2 pt-2 pb-1 font-mono text-xs text-muted">{MAILBOX_ADDRESS}</p>
            <Link href="/admin" className="block rounded-md px-2 py-1.5 text-fg/75 hover:bg-surface-2 hover:text-fg">
              Dashboard
            </Link>
            <Link href="/admin/billing" className="block rounded-md px-2 py-1.5 text-fg/75 hover:bg-surface-2 hover:text-fg">
              Billing
            </Link>
            <Link href="/admin/enquiries" className="block rounded-md px-2 py-1.5 text-fg/75 hover:bg-surface-2 hover:text-fg">
              Enquiries
            </Link>
            <form action={logout}>
              <button type="submit" className="w-full rounded-md px-2 py-1.5 text-left text-fg/75 hover:bg-surface-2 hover:text-fg">
                Sign out
              </button>
            </form>
          </div>
        </aside>

        {/* ---------- conversation list ---------- */}
        <div className={`min-h-0 w-full flex-none flex-col border-r border-line lg:w-[23rem] xl:w-[26rem] ${readerOpen ? "hidden lg:flex" : "flex"}`}>
          <div className="flex items-center gap-2 overflow-x-auto border-b border-line px-3 py-2 lg:hidden">
            <button type="button" onClick={() => startCompose("new")} className="btn btn-primary btn-sm h-9 flex-none gap-1.5">
              <Icon name="pen" /> Compose
            </button>
            {FOLDERS.map((f) => (
              <Link
                key={f}
                href={folderHref(f)}
                onClick={() => f !== folder && setPendingFolder(f)}
                className={`flex-none rounded-full px-3 py-1.5 text-sm ${(pendingFolder ?? folder) === f ? "bg-lime text-ink" : "text-fg/80"}`}
              >
                {FOLDER_LABELS[f]}
                {f === "inbox" && (unread.inbox ?? 0) > 0 && <span className="ml-1 font-mono text-xs">{unread.inbox}</span>}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 empty:hidden lg:hidden">
            <AppControls pushKey={props.pushKey} compact />
          </div>

          <div className="flex items-center gap-2 border-b border-line px-3 py-3">
            <Form action="/admin/mail" className="min-w-0 flex-1">
              {folder !== "inbox" && <input type="hidden" name="folder" value={folder} />}
              <label htmlFor="mail-q" className="sr-only">
                Search mail
              </label>
              <input id="mail-q" name="q" defaultValue={query} placeholder={`Search ${FOLDER_LABELS[folder].toLowerCase()}`} className="field field-box h-10 w-full text-sm" />
            </Form>
            <button
              type="button"
              onClick={checkNow}
              title="Check for new mail"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-fg/75 hover:bg-surface-2 hover:text-fg"
            >
              <Icon name="refresh" className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              <span className="sr-only">Check for new mail</span>
            </button>
          </div>

          <ul className={`min-h-0 flex-1 overflow-y-auto transition-opacity ${listPending ? "opacity-40" : ""}`} data-lenis-prevent aria-busy={listPending}>
            {!configured && <li className="m-3 rounded-md border border-line-strong p-3 text-sm text-fg/85">Mail is off: RESEND_API_KEY is not set.</li>}
            {threads.length === 0 && (
              <li className="p-10 text-center text-sm text-muted">{query ? "Nothing matches your search." : `No mail in ${FOLDER_LABELS[folder]}.`}</li>
            )}
            {threads.map((t) => {
              const active = t.threadKey === selected;
              const out = t.direction === "out";
              const name = out ? `To: ${t.to.map((a) => a.name || a.address).join(", ")}` : t.fromName || t.fromAddress;
              return (
                <li key={t.threadKey}>
                  <button
                    type="button"
                    onClick={() => open(t)}
                    onMouseEnter={() => preload(t.threadKey)}
                    onFocus={() => preload(t.threadKey)}
                    onTouchStart={() => preload(t.threadKey)}
                    className={`relative flex w-full gap-3 border-b border-line px-4 py-3.5 text-left transition-colors ${active ? "bg-surface-2" : "hover:bg-surface"}`}
                  >
                    {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-lime" aria-hidden="true" />}
                    <Avatar name={out ? t.to[0]?.name : t.fromName} address={out ? (t.to[0]?.address ?? "?") : t.fromAddress} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className={`min-w-0 flex-1 truncate ${t.unread ? "font-semibold text-fg" : "text-fg/80"}`}>
                          {name}
                          {t.count > 1 && <span className="ml-1.5 font-mono text-xs font-normal text-muted">{t.count}</span>}
                        </span>
                        <span className={`flex-none font-mono text-xs ${t.unread ? "text-lime" : "text-muted"}`}>{shortDate(t.date)}</span>
                      </span>
                      <span className={`mt-0.5 flex items-center gap-1.5 text-sm ${t.unread ? "font-medium text-fg" : "text-fg/75"}`}>
                        <span className="min-w-0 flex-1 truncate">{t.subject || "(no subject)"}</span>
                        {t.starred && <Icon name="starred" className="h-3.5 w-3.5 text-lime" />}
                        {t.files && <Icon name="attach" className="h-3.5 w-3.5 text-muted" />}
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-sm leading-snug text-muted">{t.snippet}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {props.moreHref && (
              <li className="p-4 text-center">
                <Link href={props.moreHref} className="text-sm text-muted hover:text-fg">
                  Load more
                </Link>
              </li>
            )}
          </ul>
        </div>

        {/* ---------- reading pane ---------- */}
        <div className={`min-h-0 min-w-0 flex-1 flex-col ${readerOpen ? "flex" : "hidden lg:flex"}`}>
          {compose ? (
            <div className="mx-auto flex h-full w-full max-w-4xl flex-col">
              <Compose key={`${compose.mode}-${compose.refId ?? ""}`} {...compose} onCancel={() => setCompose(null)} />
            </div>
          ) : selected ? (
            <>
              <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-2">
                <button type="button" onClick={close} className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm text-fg/80 hover:bg-surface-2 lg:hidden">
                  <Icon name="back" /> Back
                </button>
                {messages && (
                  <>
                    <ToolButton op={threadStarred ? "unstar" : "star"} label={threadStarred ? "Unstar" : "Star"} icon="starred" />
                    <ToolButton op="unread" label="Mark unread" icon="unread" />
                    {threadFolder === "inbox" && <ToolButton op="move" to="archive" label="Archive" icon="archive" />}
                    {threadFolder !== "inbox" && threadFolder !== "sent" && <ToolButton op="move" to="inbox" label="Move to inbox" icon="inbox" />}
                    {threadFolder !== "spam" && threadFolder !== "sent" && <ToolButton op="move" to="spam" label="Spam" icon="spam" />}
                    {threadFolder === "trash" ? (
                      <ToolButton op="delete" label="Delete forever" icon="trash" danger />
                    ) : (
                      <ToolButton op="move" to="trash" label="Trash" icon="trash" />
                    )}
                    <span className="ml-auto hidden gap-2 md:flex">{replyButtons}</span>
                  </>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto" data-lenis-prevent>
                {messages ? (
                  <Conversation messages={messages} folder={threadFolder} replyButtons={replyButtons} />
                ) : loadError ? (
                  <p className="p-10 text-center text-sm text-muted">Couldn&apos;t load this conversation. Check your connection and try again.</p>
                ) : (
                  <ReaderSkeleton />
                )}
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
              <Icon name="inbox" className="h-10 w-10 text-muted/60" />
              <p className="text-muted">Select a conversation to read it.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Conversation({ messages, folder, replyButtons }: { messages: ThreadMessage[]; folder?: string; replyButtons: React.ReactNode }) {
  const addr = (list: ThreadMessage["to"]) => list.map(formatAddress).join(", ");
  return (
    <article className="mx-auto max-w-[56rem] px-4 pt-7 pb-16 md:px-8">
      <h1 className="text-[clamp(1.375rem,2.2vw,1.875rem)] leading-tight font-semibold tracking-[-0.02em] break-words">{messages[0].subject || "(no subject)"}</h1>
      <p className="meta mt-2">
        {FOLDER_LABELS[folder as Folder] ?? folder} · {messages.length} message{messages.length > 1 ? "s" : ""}
      </p>

      <ol className="mt-6 space-y-3">
        {messages.map((m, i) => {
          const last = i === messages.length - 1;
          const files = m.attachments.filter((a) => !a.inline || !(m.html ?? "").includes(`cid:${a.contentId}`));
          const recipients = (
            <>
              to {addr(m.to) || "—"}
              {m.cc.length > 0 && <> · cc {addr(m.cc)}</>}
              {m.direction === "out" && m.bcc.length > 0 && <> · bcc {addr(m.bcc)}</>}
            </>
          );
          const head = (
            <div className="flex items-start gap-3">
              <Avatar name={m.fromName} address={m.fromAddress} size="h-10 w-10 text-base" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                  <p className="min-w-0 break-words">
                    <span className="font-semibold text-fg">{m.fromName || m.fromAddress}</span>
                    {m.fromName && <span className="ml-1.5 text-sm text-muted">&lt;{m.fromAddress}&gt;</span>}
                  </p>
                  <p className="flex-none text-xs text-muted">{longDate(m.date)}</p>
                </div>
                {last ? <p className="mt-0.5 break-words text-sm text-muted">{recipients}</p> : <p className="mt-0.5 truncate text-sm text-muted">{m.snippet}</p>}
              </div>
            </div>
          );
          const body = (
            <>
              {!last && <p className="mt-2 break-words pl-[3.25rem] text-sm text-muted">{recipients}</p>}
              <div className="mt-4">
                {m.html ? (
                  <MailFrame html={m.html} title={`Email from ${m.fromAddress}`} />
                ) : (
                  <div className="rounded-lg bg-surface-2/60 px-5 py-4 md:px-7 md:py-6">
                    <p className="max-w-[72ch] whitespace-pre-wrap break-words text-[0.975rem] leading-7 text-fg/90">{m.text || "(empty message)"}</p>
                  </div>
                )}
              </div>
              {files.length > 0 && (
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {files.map((a) => (
                    <li key={a.id}>
                      <a
                        href={`/admin/mail/attachment/${a.id}`}
                        className="flex items-center gap-3 rounded-md border border-line bg-surface px-3 py-2.5 transition-colors hover:border-line-strong"
                      >
                        <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded bg-surface-2 font-mono text-[0.625rem] uppercase text-muted">
                          {(a.filename.split(".").pop() || "file").slice(0, 4)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-fg">{a.filename}</span>
                          <span className="block text-xs text-muted">{sizeLabel(a.size)} · Download</span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </>
          );
          return (
            <li key={m.id} className="rounded-xl border border-line bg-surface/70 p-4 md:p-5">
              {last ? (
                <>
                  {head}
                  {body}
                </>
              ) : (
                <details>
                  <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">{head}</summary>
                  {body}
                </details>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-6 flex flex-wrap gap-2">{replyButtons}</div>
    </article>
  );
}

function ReaderSkeleton() {
  return (
    <div className="mx-auto max-w-[56rem] animate-pulse px-4 pt-7 md:px-8" aria-label="Loading conversation">
      <div className="h-7 w-2/3 rounded bg-surface-2" />
      <div className="mt-3 h-3 w-32 rounded bg-surface-2" />
      <div className="mt-6 rounded-xl border border-line p-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-surface-2" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-surface-2" />
            <div className="h-3 w-1/2 rounded bg-surface-2" />
          </div>
        </div>
        <div className="mt-5 h-64 rounded-lg bg-surface-2" />
      </div>
    </div>
  );
}
