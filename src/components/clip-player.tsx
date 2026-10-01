"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ScriptToggle } from "@/components/script-toggle";
import { formatTimestamp, initials } from "@/lib/format";
import { segmentText } from "@/lib/script";
import type { ScriptMode, TranscriptSegment } from "@/lib/types";

export interface ClipLine extends Pick<TranscriptSegment, "id" | "start_ms" | "end_ms" | "text" | "text_romanized" | "text_english"> {
  speaker: string;
  color: string;
}

// Plays only [start, end] of a recording, with that stretch of transcript.
export function ClipPlayer({
  media,
  start,
  end,
  lines,
  hinglish,
  initialScript,
}: {
  media: { url: string; kind: "audio" | "video" | "thumbnail" } | null;
  start: number;
  end: number;
  lines: ClipLine[];
  hinglish: boolean;
  initialScript: ScriptMode;
}) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [ms, setMs] = useState(start);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<ScriptMode>(hinglish ? initialScript : "mixed");
  const length = end - start;

  useEffect(() => {
    if (ref.current) ref.current.currentTime = start / 1000;
  }, [start]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const el = ref.current;
      if (el) {
        const now = el.currentTime * 1000;
        if (now >= end) {
          el.pause();
          el.currentTime = end / 1000;
        }
        setMs(Math.min(now, end));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, end]);

  const seek = useCallback(
    (to: number, play = true) => {
      const el = ref.current;
      const t = Math.max(start, Math.min(to, end));
      setMs(t);
      if (!el) return;
      el.currentTime = t / 1000;
      if (play) void el.play();
    },
    [start, end],
  );

  function toggle() {
    const el = ref.current;
    if (!el) return;
    if (!el.paused) return el.pause();
    if (el.currentTime * 1000 >= end - 50) el.currentTime = start / 1000;
    void el.play();
  }

  function changeMode(m: ScriptMode) {
    setMode(m);
    const url = new URL(window.location.href);
    if (m === "mixed") url.searchParams.delete("script");
    else url.searchParams.set("script", m);
    window.history.replaceState(window.history.state, "", url);
  }

  const active = lines.findLast((l) => l.start_ms <= ms) ?? lines[0];
  const handlers = {
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {media?.kind === "video" ? (
        <video ref={ref} src={media.url} preload="metadata" playsInline className="aspect-video w-full bg-black" onClick={toggle} {...handlers} />
      ) : (
        <div className="flex flex-col items-center gap-3 bg-[#101014] px-4 py-8">
          {active && (
            <>
              <span
                className="grid h-16 w-16 place-items-center rounded-full text-lg font-semibold text-on-spk transition-shadow"
                style={{ background: active.color, boxShadow: playing ? `0 0 0 4px #101014, 0 0 0 6px ${active.color}` : undefined }}
              >
                {initials(active.speaker)}
              </span>
              <span className="text-sm text-white/85">{active.speaker}</span>
            </>
          )}
          {media && <audio ref={ref} src={media.url} preload="metadata" {...handlers} />}
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-border px-4 py-3">
        <button
          onClick={toggle}
          disabled={!media}
          aria-label={playing ? "Pause" : "Play clip"}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-white disabled:opacity-40"
        >
          {playing ? (
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
              <rect x="3.5" y="2.5" width="3" height="11" rx="0.75" />
              <rect x="9.5" y="2.5" width="3" height="11" rx="0.75" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" className="ml-0.5 h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M4 2.5v11a.5.5 0 0 0 .76.43l9-5.5a.5.5 0 0 0 0-.86l-9-5.5A.5.5 0 0 0 4 2.5Z" />
            </svg>
          )}
        </button>
        <div
          className="relative h-1.5 flex-1 cursor-pointer rounded-full bg-surface-2"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            seek(start + ((e.clientX - r.left) / r.width) * length);
          }}
          role="slider"
          aria-label="Seek within clip"
          aria-valuemin={0}
          aria-valuemax={Math.round(length / 1000)}
          aria-valuenow={Math.round((ms - start) / 1000)}
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${((ms - start) / length) * 100}%` }} />
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
          {formatTimestamp(ms - start)} / {formatTimestamp(length)}
        </span>
      </div>

      {hinglish && (
        <div className="flex items-center gap-2 border-t border-border px-4 py-2">
          <span className="text-xs text-muted">Hinglish · show as</span>
          <ScriptToggle mode={mode} onChange={changeMode} />
        </div>
      )}

      <ol className="space-y-3 border-t border-border px-4 py-4">
        {lines.map((l) => (
          <li key={l.id}>
            <button onClick={() => seek(l.start_ms)} className="w-full text-left">
              <span className="text-xs font-semibold" style={{ color: l.color }}>
                {l.speaker}
              </span>
              <span
                className={`mt-0.5 block rounded px-1 -mx-1 text-[15px] leading-relaxed transition-colors ${
                  l.id === active?.id && (playing || ms > start) ? "bg-accent-soft" : ""
                }`}
              >
                {segmentText(l, mode)}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
