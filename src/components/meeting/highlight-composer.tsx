"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDuration, formatTimestamp } from "@/lib/format";
import type { Highlight, TranscriptSegment } from "@/lib/types";

const NAME_KEY = "undertone:name";

/** Widen a rough range to whole transcript lines so clips don't cut words off. */
export function snapToLines(segments: TranscriptSegment[], start: number, end: number) {
  const first = segments.find((s) => s.end_ms > start);
  const last = segments.findLast((s) => s.start_ms < end);
  return {
    start: first && first.start_ms <= end ? Math.min(start, first.start_ms) : start,
    end: last && last.end_ms >= start ? Math.max(end, last.end_ms) : end,
  };
}

export function HighlightComposer({
  meetingId,
  segments,
  textOf,
  durationMs,
  range,
  onPreview,
  onClose,
  onSaved,
}: {
  meetingId: string;
  segments: TranscriptSegment[];
  textOf: (s: TranscriptSegment) => string;
  durationMs: number;
  range: { start: number; end: number };
  onPreview: (start: number, end: number) => void;
  onClose: () => void;
  onSaved: (h: Highlight) => void;
}) {
  const [start, setStart] = useState(range.start);
  const [end, setEnd] = useState(range.end);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const excerpt = useMemo(
    () =>
      segments
        .filter((s) => s.start_ms < end && s.end_ms > start)
        .map(textOf)
        .join(" "),
    [segments, textOf, start, end],
  );

  const nudge = (which: "start" | "end", delta: number) => {
    if (which === "start") setStart((s) => Math.max(0, Math.min(s + delta, end - 1000)));
    else setEnd((e) => Math.min(durationMs, Math.max(e + delta, start + 1000)));
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      try {
        if (name.trim()) localStorage.setItem(NAME_KEY, name.trim());
      } catch {}
      const res = await fetch(`/api/meetings/${meetingId}/highlights`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ start_ms: start, end_ms: end, title, note, created_by_name: name }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Save failed (${res.status})`);
      onSaved(body as Highlight);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-black/40 p-0 sm:place-items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={save}
        role="dialog"
        aria-modal="true"
        aria-label="New highlight"
        className="w-full max-w-md space-y-4 rounded-t-2xl border border-border bg-surface p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">New highlight</h2>
          <span className="font-mono text-xs text-muted">{formatDuration(end - start)}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          {(["start", "end"] as const).map((which) => (
            <div key={which} className="rounded-lg border border-border px-3 py-2">
              <p className="text-xs capitalize text-muted">{which}</p>
              <div className="mt-1 flex items-center justify-between">
                <button type="button" onClick={() => nudge(which, -5000)} className="rounded px-1.5 text-muted hover:bg-surface-2" aria-label={`${which} 5 seconds earlier`}>
                  −5s
                </button>
                <span className="font-mono tabular-nums">{formatTimestamp(which === "start" ? start : end)}</span>
                <button type="button" onClick={() => nudge(which, 5000)} className="rounded px-1.5 text-muted hover:bg-surface-2" aria-label={`${which} 5 seconds later`}>
                  +5s
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="max-h-28 overflow-y-auto rounded-lg bg-surface-2 px-3 py-2 text-sm leading-relaxed text-muted">
          {excerpt || "No speech in this range."}
        </div>
        <button type="button" onClick={() => onPreview(start, end)} className="text-sm text-accent hover:underline">
          ▶ Preview clip
        </button>

        <label className="block text-sm">
          <span className="text-xs text-muted">Title</span>
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder={excerpt ? excerpt.split(/\s+/).slice(0, 8).join(" ") + "…" : "What happened here?"}
            className="mt-1 w-full rounded-md border border-border bg-bg px-2.5 py-1.5 outline-none focus:border-accent"
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-muted">Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={1000}
            className="mt-1 w-full resize-none rounded-md border border-border bg-bg px-2.5 py-1.5 outline-none focus:border-accent"
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-muted">Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Guest"
            className="mt-1 w-full rounded-md border border-border bg-bg px-2.5 py-1.5 outline-none focus:border-accent"
          />
        </label>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-surface-2">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save highlight"}
          </button>
        </div>
      </form>
    </div>
  );
}
