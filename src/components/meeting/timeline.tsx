"use client";

import { memo, useRef, useState } from "react";
import { formatTimestamp } from "@/lib/format";
import { speakerColor } from "@/lib/speakers";
import type { Chapter, Highlight, TranscriptSegment } from "@/lib/types";
import type { ViewParticipant } from "./meeting-view";

const pct = (ms: number, total: number) => `${(ms / total) * 100}%`;

export function Timeline({
  durationMs,
  ms,
  participants,
  segments,
  chapters,
  highlights,
  clip,
  matchTimes,
  onSeek,
}: {
  durationMs: number;
  ms: number;
  participants: ViewParticipant[];
  segments: TranscriptSegment[];
  chapters: Chapter[];
  highlights: Highlight[];
  clip: { start: number; end: number } | null;
  matchTimes: number[];
  onSeek: (ms: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const timeAt = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * durationMs;
  };
  const hoverChapter = hover != null ? chapters.findLast((c) => c.start_ms <= hover) : null;

  return (
    <div className="border-t border-border px-4 pb-4 pt-3">
      <div className="flex gap-3">
        <div className="w-24 shrink-0" />
        {/* Scrubber: chapters, highlights and search matches share one track. */}
        <div
          ref={trackRef}
          className="relative h-5 flex-1 cursor-pointer touch-none select-none"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragging(true);
            onSeek(timeAt(e.clientX));
          }}
          onPointerMove={(e) => {
            setHover(timeAt(e.clientX));
            if (dragging) onSeek(timeAt(e.clientX));
          }}
          onPointerUp={() => setDragging(false)}
          onPointerLeave={() => setHover(null)}
          role="slider"
          tabIndex={0}
          aria-label="Seek (left and right arrows skip 5 seconds)"
          aria-valuemin={0}
          aria-valuemax={Math.round(durationMs / 1000)}
          aria-valuenow={Math.round(ms / 1000)}
          aria-valuetext={formatTimestamp(ms)}
        >
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent" style={{ width: pct(ms, durationMs) }} />
          </div>
          {clip && (
            <span
              className="absolute top-1/2 h-4 -translate-y-1/2 rounded bg-amber-300/40 ring-1 ring-amber-400"
              style={{ left: pct(clip.start, durationMs), width: `max(6px, ${pct(clip.end - clip.start, durationMs)})` }}
            />
          )}
          {chapters.slice(1).map((c) => (
            <span
              key={c.id}
              className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-surface"
              style={{ left: pct(c.start_ms, durationMs) }}
            />
          ))}
          {highlights.map((h) => (
            <span
              key={h.id}
              title={h.title ?? "Highlight"}
              className="absolute -top-0.5 h-1.5 rounded-full bg-amber-400"
              style={{ left: pct(h.start_ms, durationMs), width: `max(4px, ${pct(h.end_ms - h.start_ms, durationMs)})` }}
            />
          ))}
          {matchTimes.map((t, i) => (
            <span
              key={i}
              className="absolute -bottom-0.5 h-1.5 w-0.5 rounded-full bg-text"
              style={{ left: pct(t, durationMs) }}
            />
          ))}
          <span
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent shadow"
            style={{ left: pct(ms, durationMs) }}
          />
          {hover != null && (
            <span
              className="pointer-events-none absolute bottom-full mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-text px-2 py-1 text-[11px] text-bg shadow"
              style={{ left: pct(hover, durationMs) }}
            >
              <span className="font-mono">{formatTimestamp(hover)}</span>
              {hoverChapter && <span className="ml-1.5 opacity-80">{hoverChapter.title}</span>}
            </span>
          )}
        </div>
      </div>

      <SpeakerLanes durationMs={durationMs} participants={participants} segments={segments} onSeek={onSeek} ms={ms} />
    </div>
  );
}

// One lane per person showing when they spoke. The bars never change, so they're
// memoized; only the playhead moves.
function SpeakerLanes({
  durationMs,
  participants,
  segments,
  onSeek,
  ms,
}: {
  durationMs: number;
  participants: ViewParticipant[];
  segments: TranscriptSegment[];
  onSeek: (ms: number) => void;
  ms: number;
}) {
  const total = participants.reduce((s, p) => s + p.talk_time_ms, 0) || 1;
  return (
    <div className="relative mt-3 space-y-1.5">
      {participants.map((p) => (
        <div key={p.id} className="flex items-center gap-3">
          <div className="flex w-24 shrink-0 items-baseline justify-between gap-1 text-[11px]">
            <span className="truncate">{p.name.split(" ")[0]}</span>
            <span className="font-mono text-muted">{Math.round((p.talk_time_ms / total) * 100)}%</span>
          </div>
          <Lane
            durationMs={durationMs}
            color={speakerColor(p.color, p.index)}
            segments={segments}
            participantId={p.id}
            onSeek={onSeek}
          />
        </div>
      ))}
      <div className="pointer-events-none absolute inset-y-0 left-[6.75rem] right-0">
        <span className="absolute inset-y-0 w-px bg-text/50" style={{ left: pct(ms, durationMs) }} />
      </div>
    </div>
  );
}

const Lane = memo(function Lane({
  durationMs,
  color,
  segments,
  participantId,
  onSeek,
}: {
  durationMs: number;
  color: string;
  segments: TranscriptSegment[];
  participantId: string;
  onSeek: (ms: number) => void;
}) {
  return (
    <div
      className="relative h-2 flex-1 cursor-pointer rounded-sm bg-surface-2"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onSeek(((e.clientX - r.left) / r.width) * durationMs);
      }}
    >
      {segments.map((s) =>
        s.participant_id === participantId ? (
          <span
            key={s.id}
            className="absolute inset-y-0 rounded-[1px]"
            style={{
              left: pct(s.start_ms, durationMs),
              width: `max(1.5px, ${pct(s.end_ms - s.start_ms, durationMs)})`,
              background: color,
            }}
          />
        ) : null,
      )}
    </div>
  );
});
