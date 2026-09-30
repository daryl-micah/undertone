"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { formatTimestamp } from "@/lib/format";
import { speakerColor } from "@/lib/speakers";
import type { TranscriptSegment } from "@/lib/types";
import type { ViewParticipant } from "./meeting-view";

interface Turn {
  participantId: string | null;
  label: string;
  first: number; // index into segments
  last: number;
}

export function Transcript({
  participants,
  segments,
  activeIndex,
  playing,
  query,
  onQueryChange,
  matches,
  onSeek,
}: {
  participants: ViewParticipant[];
  segments: TranscriptSegment[];
  activeIndex: number;
  playing: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  matches: number[];
  onSeek: (ms: number, play?: boolean) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const [matchCursor, setMatchCursor] = useState(0);
  const byId = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);

  // Consecutive lines from the same person read as one turn.
  const turns = useMemo(() => {
    const out: Turn[] = [];
    segments.forEach((s, i) => {
      const prev = out.at(-1);
      if (prev && prev.participantId === s.participant_id) prev.last = i;
      else out.push({ participantId: s.participant_id, label: s.speaker_label, first: i, last: i });
    });
    return out;
  }, [segments]);

  function scrollToIndex(i: number, smooth = true) {
    const box = scrollRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-i="${i}"]`);
    if (!box || !el) return;
    box.scrollTo({ top: el.offsetTop - box.clientHeight / 3, behavior: smooth ? "smooth" : "auto" });
  }

  // Follow playback until the reader scrolls away on their own.
  useEffect(() => {
    if (following && activeIndex >= 0) scrollToIndex(activeIndex);
  }, [activeIndex, following]);

  const q = query.trim().toLowerCase();
  const searching = q.length >= 2;
  const currentMatch = matches.length ? Math.min(matchCursor, matches.length - 1) : -1;

  function step(dir: 1 | -1) {
    if (!matches.length) return;
    const next = (currentMatch + dir + matches.length) % matches.length;
    setMatchCursor(next);
    setFollowing(false);
    scrollToIndex(matches[next]);
  }

  const stopFollowing = () => setFollowing(false);

  return (
    <section className="relative flex h-[70vh] min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-[calc(100vh-7rem)] lg:self-start">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <h2 className="px-1 text-sm font-medium">Transcript</h2>
        <div className="relative ml-auto flex min-w-0 flex-1 items-center">
          <input
            type="search"
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value);
              setMatchCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                step(e.shiftKey ? -1 : 1);
              }
              if (e.key === "Escape") onQueryChange("");
            }}
            placeholder="Search transcript"
            className="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
        </div>
        {searching && (
          <div className="flex shrink-0 items-center gap-0.5 text-xs text-muted">
            <span className="px-1 font-mono tabular-nums">
              {matches.length ? `${currentMatch + 1}/${matches.length}` : "0"}
            </span>
            <IconButton label="Previous match" onClick={() => step(-1)} disabled={!matches.length}>
              ↑
            </IconButton>
            <IconButton label="Next match" onClick={() => step(1)} disabled={!matches.length}>
              ↓
            </IconButton>
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        onWheel={stopFollowing}
        onTouchMove={stopFollowing}
        onPointerDown={(e) => e.target === e.currentTarget && stopFollowing()}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2"
      >
        {turns.map((t) => {
          const p = t.participantId ? byId.get(t.participantId) : undefined;
          const holdsActive = activeIndex >= t.first && activeIndex <= t.last;
          const holdsMatch = currentMatch >= 0 && matches[currentMatch] >= t.first && matches[currentMatch] <= t.last;
          return (
            <TurnBlock
              key={t.first}
              turn={t}
              segments={segments}
              name={p?.name ?? t.label}
              color={speakerColor(p?.color, p?.index)}
              activeIndex={holdsActive ? activeIndex : -1}
              query={searching ? q : ""}
              currentMatchIndex={holdsMatch ? matches[currentMatch] : -1}
              onSeek={onSeek}
            />
          );
        })}
      </div>

      {!following && (playing || activeIndex >= 0) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
          <button
            onClick={() => {
              setFollowing(true);
              scrollToIndex(activeIndex);
            }}
            className="pointer-events-auto rounded-full bg-text px-3.5 py-1.5 text-xs font-medium text-bg shadow-lg"
          >
            Jump to now
          </button>
        </div>
      )}
    </section>
  );
}

const TurnBlock = memo(function TurnBlock({
  turn,
  segments,
  name,
  color,
  activeIndex,
  query,
  currentMatchIndex,
  onSeek,
}: {
  turn: Turn;
  segments: TranscriptSegment[];
  name: string;
  color: string;
  activeIndex: number;
  query: string;
  currentMatchIndex: number;
  onSeek: (ms: number, play?: boolean) => void;
}) {
  const start = segments[turn.first].start_ms;
  return (
    <div className="rounded-lg px-2 py-2">
      <div className="mb-0.5 flex items-baseline gap-2">
        <span className="text-xs font-semibold" style={{ color }}>
          {name}
        </span>
        <button onClick={() => onSeek(start, true)} className="font-mono text-[11px] text-muted hover:text-text">
          {formatTimestamp(start)}
        </button>
      </div>
      <p className="text-[15px] leading-relaxed">
        {segments.slice(turn.first, turn.last + 1).map((s, k) => {
          const i = turn.first + k;
          const active = i === activeIndex;
          return (
            <span
              key={s.id}
              data-i={i}
              onClick={() => onSeek(s.start_ms, true)}
              className={`cursor-pointer rounded px-0.5 transition-colors ${
                active ? "bg-accent-soft text-text" : "hover:bg-surface-2"
              } ${activeIndex >= 0 && i > activeIndex ? "text-muted" : ""}`}
            >
              {query ? <Marked text={s.text} query={query} strong={i === currentMatchIndex} /> : s.text}{" "}
            </span>
          );
        })}
      </p>
    </div>
  );
});

function Marked({ text, query, strong }: { text: string; query: string; strong: boolean }) {
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className={`rounded-sm px-0.5 text-[#1a1a18] ${strong ? "bg-amber-300" : "bg-amber-200"}`}>
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-6 w-6 place-items-center rounded hover:bg-surface-2 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
