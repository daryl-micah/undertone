"use client";

import { useEffect, useRef, useState } from "react";
import type { ShareLink, ShareTarget } from "@/lib/types";

const NAME_KEY = "undertone:name";

function savedName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

/** A "Share" button that opens the dialog. */
export function ShareButton({
  targetType,
  targetId,
  label,
  className,
}: {
  targetType: ShareTarget;
  targetId: string;
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={className} aria-label={`Share ${label}`}>
        Share
      </button>
      {open && <ShareDialog targetType={targetType} targetId={targetId} label={label} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareDialog({
  targetType,
  targetId,
  label,
  onClose,
}: {
  targetType: ShareTarget;
  targetId: string;
  label: string;
  onClose: () => void;
}) {
  const [allowFull, setAllowFull] = useState(false);
  const [share, setShare] = useState<ShareLink | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // One request per permission; the API reuses an existing link if there is one.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/shares", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target_type: targetType,
        target_id: targetId,
        allow_full_meeting: allowFull,
        created_by_name: savedName(),
      }),
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Couldn't create a link");
        if (!cancelled) setShare(body as ShareLink);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [targetType, targetId, allowFull]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Carry the reader's Hinglish view (?script=) so the recipient sees the same text.
  const script = typeof window === "undefined" ? null : new URL(window.location.href).searchParams.get("script");
  const url = share ? `${window.location.origin}/s/${share.token}${script ? `?script=${script}` : ""}` : "";
  const canNativeShare = typeof navigator !== "undefined" && "share" in navigator;

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      inputRef.current?.select();
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-black/40 sm:place-items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Share ${label}`}
        className="w-full max-w-md space-y-4 rounded-t-2xl border border-border bg-surface p-5 text-left shadow-xl sm:rounded-2xl"
      >
        <div>
          <h2 className="font-semibold">Share {targetType === "highlight" ? "clip" : "meeting"}</h2>
          <p className="mt-0.5 truncate text-sm text-muted">{label}</p>
        </div>

        <p className="text-sm text-muted">
          Anyone with the link can {targetType === "highlight" ? "play this clip and read what was said" : "read the summary and action items"}
          , no account needed.
        </p>

        <div className="flex gap-2">
          <input
            ref={inputRef}
            readOnly
            value={url || (error ? "" : "Creating link…")}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Share link"
            className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 font-mono text-xs outline-none"
          />
          <button
            onClick={copy}
            disabled={!url}
            className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}

        {targetType === "highlight" && (
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={allowFull}
              onChange={(e) => {
                // A different permission is a different link.
                setAllowFull(e.target.checked);
                setShare(null);
                setError("");
              }}
              className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
            />
            <span>
              Let them open the full meeting
              <span className="block text-xs text-muted">Otherwise they only see this clip.</span>
            </span>
          </label>
        )}

        <div className="flex items-center gap-2 border-t border-border pt-3 text-xs text-muted">
          <span>
            {share ? `Viewed ${share.view_count} ${share.view_count === 1 ? "time" : "times"}` : " "}
          </span>
          {canNativeShare && url && (
            <button
              onClick={() => navigator.share({ title: label, url }).catch(() => {})}
              className="ml-auto rounded-md border border-border px-2.5 py-1 text-text hover:bg-surface-2"
            >
              Share via…
            </button>
          )}
          <button onClick={onClose} className={`${canNativeShare && url ? "" : "ml-auto "}rounded-md px-2.5 py-1 hover:bg-surface-2`}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
