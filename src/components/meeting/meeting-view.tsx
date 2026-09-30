"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatTimestamp } from "@/lib/format";
import type { ActionItem, Chapter, Highlight, Summary, SummaryTemplate, TranscriptSegment } from "@/lib/types";
import { Panels } from "./panels";
import { Stage } from "./stage";
import { Timeline } from "./timeline";
import { Transcript } from "./transcript";

export interface ViewParticipant {
  id: string;
  name: string;
  color: string | null;
  is_external: boolean;
  is_host: boolean;
  talk_time_ms: number;
  index: number;
}

export interface ViewMedia {
  kind: "video" | "audio" | "thumbnail";
  url: string;
  mime: string;
}

const RATES = [1, 1.25, 1.5, 1.75, 2];

/** Index of the last segment that has started at `ms` (or -1). */
function segmentAt(segments: TranscriptSegment[], ms: number) {
  let lo = 0;
  let hi = segments.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].start_ms <= ms) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export function MeetingView({
  meetingId,
  templates,
  summaries,
  durationMs,
  media,
  participants,
  segments,
  chapters,
  actionItems,
  highlights,
  initialMs,
}: {
  meetingId: string;
  templates: SummaryTemplate[];
  summaries: Summary[];
  durationMs: number;
  media: ViewMedia | null;
  participants: ViewParticipant[];
  segments: TranscriptSegment[];
  chapters: Chapter[];
  actionItems: ActionItem[];
  highlights: Highlight[];
  initialMs: number;
}) {
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [ms, setMs] = useState(initialMs);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [query, setQuery] = useState("");

  // Smooth playhead while playing; paused state is driven by seeks.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const el = mediaRef.current;
      if (el) setMs(el.currentTime * 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const seek = useCallback(
    (to: number, play = false) => {
      const el = mediaRef.current;
      const clamped = Math.max(0, Math.min(to, durationMs));
      setMs(clamped);
      if (!el) return;
      el.currentTime = clamped / 1000;
      if (play) void el.play();
    },
    [durationMs],
  );

  const togglePlay = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }, []);

  const changeRate = useCallback(() => {
    setRate((r) => {
      const next = RATES[(RATES.indexOf(r) + 1) % RATES.length];
      if (mediaRef.current) mediaRef.current.playbackRate = next;
      return next;
    });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const now = (mediaRef.current?.currentTime ?? 0) * 1000;
      const actions: Record<string, () => void> = {
        " ": togglePlay,
        k: togglePlay,
        j: () => seek(now - 10_000),
        l: () => seek(now + 10_000),
        ArrowLeft: () => seek(now - 5_000),
        ArrowRight: () => seek(now + 5_000),
      };
      const action = actions[e.key];
      if (!action) return;
      e.preventDefault();
      action();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [seek, togglePlay]);

  const activeIndex = segmentAt(segments, ms);
  const active = activeIndex >= 0 ? segments[activeIndex] : null;
  const speakingId = active && ms <= active.end_ms ? active.participant_id : null;
  const chapter = chapters.findLast((c) => c.start_ms <= ms) ?? null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return segments.flatMap((s, i) => (s.text.toLowerCase().includes(q) ? [i] : []));
  }, [query, segments]);

  return (
    // Mobile order: player, transcript, panels. Desktop: player and panels left, transcript right.
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:grid-rows-[auto_1fr] lg:gap-x-6">
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
        <section className="overflow-hidden rounded-xl border border-border bg-surface">
          {media?.kind === "video" ? (
            <video
              ref={mediaRef}
              src={media.url}
              className="aspect-video w-full bg-black"
              onClick={togglePlay}
              {...mediaHandlers()}
            />
          ) : (
            <>
              <Stage participants={participants} speakingId={speakingId} playing={playing} />
              {media && <audio ref={mediaRef} src={media.url} preload="metadata" {...mediaHandlers()} />}
            </>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-3">
            <button
              onClick={togglePlay}
              disabled={!media}
              aria-label={playing ? "Pause" : "Play"}
              className="grid h-10 w-10 place-items-center rounded-full bg-accent text-white transition hover:opacity-90 disabled:opacity-40"
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <div className="flex items-center gap-1">
              <SkipButton label="Back 10 seconds" onClick={() => seek(ms - 10_000)}>
                −10
              </SkipButton>
              <SkipButton label="Forward 10 seconds" onClick={() => seek(ms + 10_000)}>
                +10
              </SkipButton>
            </div>
            <p className="font-mono text-sm tabular-nums">
              {formatTimestamp(ms)} <span className="text-muted">/ {formatTimestamp(durationMs)}</span>
            </p>
            {chapter && (
              <p className="hidden min-w-0 flex-1 truncate text-sm text-muted sm:block">
                <span className="text-text">{chapter.title}</span>
              </p>
            )}
            <button
              onClick={changeRate}
              className="ml-auto rounded-md border border-border px-2 py-1 font-mono text-xs tabular-nums hover:bg-surface-2"
              aria-label="Playback speed"
            >
              {rate}×
            </button>
          </div>

          <Timeline
            durationMs={durationMs}
            ms={ms}
            participants={participants}
            segments={segments}
            chapters={chapters}
            highlights={highlights}
            matchTimes={matches.map((i) => segments[i].start_ms)}
            onSeek={seek}
          />
        </section>
      </div>

      <Transcript
        participants={participants}
        segments={segments}
        activeIndex={activeIndex}
        playing={playing}
        query={query}
        onQueryChange={setQuery}
        matches={matches}
        onSeek={seek}
      />

      <div className="min-w-0 lg:col-start-1 lg:row-start-2">
        <Panels
          meetingId={meetingId}
          templates={templates}
          summaries={summaries}
          ms={ms}
          durationMs={durationMs}
          participants={participants}
          chapters={chapters}
          actionItems={actionItems}
          highlights={highlights}
          onSeek={seek}
        />
      </div>
    </div>
  );

  function mediaHandlers() {
    return {
      onPlay: () => setPlaying(true),
      onPause: () => setPlaying(false),
      onEnded: () => setPlaying(false),
      onSeeked: (e: React.SyntheticEvent<HTMLMediaElement>) => setMs(e.currentTarget.currentTime * 1000),
      onLoadedMetadata: (e: React.SyntheticEvent<HTMLMediaElement>) => {
        if (initialMs > 0) e.currentTarget.currentTime = initialMs / 1000;
      },
    };
  }
}

function SkipButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="rounded-md px-2 py-1 font-mono text-xs text-muted hover:bg-surface-2 hover:text-text"
    >
      {children}
    </button>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" className="ml-0.5 h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M4 2.5v11a.5.5 0 0 0 .76.43l9-5.5a.5.5 0 0 0 0-.86l-9-5.5A.5.5 0 0 0 4 2.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
      <rect x="3.5" y="2.5" width="3" height="11" rx="0.75" />
      <rect x="9.5" y="2.5" width="3" height="11" rx="0.75" />
    </svg>
  );
}
