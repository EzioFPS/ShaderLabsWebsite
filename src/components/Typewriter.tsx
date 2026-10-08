"use client";

import { useEffect, useState } from "react";

// Types each phrase, deletes it, then types the next, looping forever.
// Reduced motion: shows the last phrase straight away.
const TYPE_MS = 55;
const DELETE_MS = 30;
const HOLD_MS = 1100;

export function Typewriter({ phrases, className = "" }: { phrases: string[]; className?: string }) {
  const last = phrases[phrases.length - 1];
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setText(last);
      setDone(true);
      return;
    }
    let timer: number;
    let index = 0;
    let length = 0;
    let deleting = false;

    const tick = () => {
      const phrase = phrases[index];
      if (!deleting) {
        length++;
        setText(phrase.slice(0, length));
        if (length === phrase.length) {
          deleting = true;
          timer = window.setTimeout(tick, HOLD_MS);
          return;
        }
        timer = window.setTimeout(tick, TYPE_MS);
      } else {
        length--;
        setText(phrase.slice(0, length));
        if (length === 0) {
          deleting = false;
          index = (index + 1) % phrases.length;
        }
        timer = window.setTimeout(tick, DELETE_MS);
      }
    };
    timer = window.setTimeout(tick, 600);
    return () => window.clearTimeout(timer);
  }, [phrases, last]);

  return (
    <span className={className} aria-label={last}>
      <span aria-hidden="true">
        {text}
        <span className={`typewriter-caret${done ? " is-done" : ""}`}>_</span>
      </span>
    </span>
  );
}
