"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

/**
 * Tanda ⓘ. Muncul saat kursor, fokus keyboard, atau ketukan.
 * Ketukan menahan penjelasan sampai ditutup. Tautan di dalamnya membuka panduan.
 */
export function TermTip({ href, label, tip }: { href: string; label: string; tip: string }) {
  const [pinned, setPinned] = useState(false);
  const [hot, setHot] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tipId = useId();
  const shown = pinned || hot;
  const [pos, setPos] = useState({ top: 0, left: 0 });

  function place() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 256;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    setPos({ top: rect.bottom + 6, left });
  }

  useEffect(() => {
    if (!shown) return;
    place();
    function onMove() {
      place();
    }
    function onPointer(event: MouseEvent) {
      if (!pinned) return;
      if (!rootRef.current?.contains(event.target as Node)) setPinned(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPinned(false);
        setHot(false);
        buttonRef.current?.focus();
      }
    }
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [shown, pinned]);

  return (
    <span
      ref={rootRef}
      className="relative inline-flex"
      onMouseEnter={() => {
        setHot(true);
        place();
      }}
      onMouseLeave={() => setHot(false)}
    >
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        aria-expanded={shown}
        aria-describedby={shown ? tipId : undefined}
        aria-label={`Penjelasan ${label}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setPinned((value) => !value);
          place();
        }}
        onFocus={() => {
          setHot(true);
          place();
        }}
        onBlur={(event) => {
          if (!rootRef.current?.contains(event.relatedTarget as Node)) setHot(false);
        }}
      >
        <span aria-hidden>ⓘ</span>
      </button>
      {shown ? (
        <span
          id={tipId}
          role="tooltip"
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-50 w-64 rounded-md border border-border bg-slate-950 p-2 text-left text-xs font-normal normal-case leading-5 text-foreground shadow-lg"
        >
          {tip}{" "}
          <Link href={href} className="text-info underline-offset-2 hover:underline">
            Buka panduan.
          </Link>
        </span>
      ) : null}
    </span>
  );
}
