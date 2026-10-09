"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { sendAction, type SendState } from "./actions";

type Props = {
  mode: "new" | "reply" | "replyall" | "forward";
  refId?: string;
  to?: string;
  cc?: string;
  subject?: string;
  body?: string;
  forwardedFiles?: string[];
  cancelHref: string;
};

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary btn-sm h-10" disabled={pending}>
      {pending ? "Sending…" : "Send"}
    </button>
  );
}

export function Compose({ mode, refId, to = "", cc = "", subject = "", body = "", forwardedFiles = [], cancelHref }: Props) {
  const [state, action] = useActionState<SendState, FormData>(sendAction, {});
  const [showBcc, setShowBcc] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const title = { new: "New message", reply: "Reply", replyall: "Reply all", forward: "Forward" }[mode];
  const totalMb = files.reduce((n, f) => n + f.size, 0) / 1024 / 1024;

  return (
    <form action={action} className="flex h-full flex-col">
      <input type="hidden" name="mode" value={mode} />
      {refId && <input type="hidden" name="ref" value={refId} />}

      <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
        <h2 className="t-h3">{title}</h2>
        <Link href={cancelHref} className="text-sm text-muted hover:text-fg">
          Discard
        </Link>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-5 py-3" data-lenis-prevent>
        {[
          ["to", "To", to],
          ["cc", "Cc", cc],
        ].map(([name, label, value]) => (
          <label key={name} className="flex items-center gap-3 border-b border-line py-2">
            <span className="w-10 flex-none text-sm text-muted">{label}</span>
            <input
              name={name}
              defaultValue={value}
              placeholder={name === "to" ? "name@company.com, another@company.com" : ""}
              className="min-w-0 flex-1 bg-transparent py-1 outline-none placeholder:text-muted/60"
              autoComplete="off"
              autoFocus={name === "to" && !value}
            />
            {name === "to" && !showBcc && (
              <button type="button" onClick={() => setShowBcc(true)} className="text-xs text-muted hover:text-fg">
                Bcc
              </button>
            )}
          </label>
        ))}
        {showBcc && (
          <label className="flex items-center gap-3 border-b border-line py-2">
            <span className="w-10 flex-none text-sm text-muted">Bcc</span>
            <input name="bcc" className="min-w-0 flex-1 bg-transparent py-1 outline-none" autoComplete="off" autoFocus />
          </label>
        )}
        <label className="flex items-center gap-3 border-b border-line py-2">
          <span className="w-10 flex-none text-sm text-muted">Subj.</span>
          <input name="subject" defaultValue={subject} className="min-w-0 flex-1 bg-transparent py-1 outline-none" autoComplete="off" />
        </label>
        <textarea
          name="body"
          defaultValue={body}
          autoFocus={Boolean(to)}
          rows={14}
          className="block min-h-[16rem] w-full resize-y bg-transparent py-3 leading-relaxed outline-none"
          placeholder="Write your message"
        />

        {(forwardedFiles.length > 0 || files.length > 0) && (
          <ul className="flex flex-wrap gap-2 pb-2">
            {forwardedFiles.map((f) => (
              <li key={`fw-${f}`} className="chip">
                {f}
              </li>
            ))}
            {files.map((f) => (
              <li key={`${f.name}-${f.size}`} className="chip">
                {f.name} · {(f.size / 1024).toFixed(0)} KB
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3">
        <SendButton />
        <label className="btn btn-ghost btn-sm h-10 cursor-pointer">
          Attach files
          <input
            type="file"
            name="files"
            multiple
            className="sr-only"
            onChange={(e) => setFiles(Array.from(e.currentTarget.files ?? []))}
          />
        </label>
        {totalMb > 4.5 && <span className="text-sm text-[#ffb3b3]">Over 4.5 MB in total</span>}
        <span className="ml-auto text-xs text-muted">From mail@shaderlabs.in</span>
        {state.error && (
          <p role="alert" className="w-full text-sm text-[#ffb3b3]">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
