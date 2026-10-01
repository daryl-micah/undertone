"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clipTitle, formatTimestamp } from "@/lib/format";
import { segmentText } from "@/lib/script";
import type {
  ActionItem,
  Chapter,
  Highlight,
  ScriptMode,
  Summary,
  SummaryTemplate,
  TranscriptSegment,
} from "@/lib/types";
import { HighlightComposer, snapToLines } from "./highlight-composer";
import { Panels, type PanelTab } from "./panels";
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
  highlights: initialHighlights,
  initialMs,
  initialClipId,
  initialQuery = "",
  languageMix,
  initialScript,
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
  initialClipId?: string;
  initialQuery?: string;
  languageMix: "en" | "hi-en" | "hi";
  initialScript: ScriptMode;
}) {
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [ms, setMs] = useState(initialMs);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [query, setQuery] = useState(initialQuery);
  const [tab, setTab] = useState<PanelTab>("summary");
  // Hinglish meetings can be read as spoken, romanized or in English; kept in ?script=.
  // Any Hindi (code-mixed or mostly Hindi) can be read romanized or in English.
  const hinglish = languageMix !== "en";
  const [scriptMode, setScriptMode] = useState<ScriptMode>(hinglish ? initialScript : "mixed");
  const textOf = useCallback((s: TranscriptSegment) => segmentText(s, scriptMode), [scriptMode]);
  const changeScript = useCallback((mode: ScriptMode) => {
    setScriptMode(mode);
    const url = new URL(window.location.href);
    if (mode === "mixed") url.searchParams.delete("script");
    else url.searchParams.set("script", mode);
    window.history.replaceState(window.history.state, "", url);
  }, []);
  const excerptOf = useCallback(
    (h: Highlight) =>
      segments
        .filter((s) => s.start_ms < h.end_ms && s.end_ms > h.start_ms)
        .map(textOf)
        .join(" ") || h.excerpt,
    [segments, textOf],
  );
  const [highlights, setHighlights] = useState(initialHighlights);
  const [composer, setComposer] = useState<{ start: number; end: number } | null>(null);
  // A clip plays a bounded range and stops at its end.
  const [clip, setClip] = useState<{ start: number; end: number; title: string } | null>(() => {
    const h = initialHighlights.find((x) => x.id === initialClipId);
    return h ? { start: h.start_ms, end: h.end_ms, title: clipTitle(h) } : null;
  });
  const clipRef = useRef(clip);
  useEffect(() => {
    clipRef.current = clip;
  }, [clip]);

  // Start at ?t= / ?clip=. The element may have loaded metadata before hydration,
  // so a loadedmetadata handler alone can miss it; setting currentTime works either way.
  useEffect(() => {
    if (mediaRef.current && initialMs > 0) mediaRef.current.currentTime = initialMs / 1000;
  }, [initialMs]);

  // Smooth playhead while playing; paused state is driven by seeks.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const el = mediaRef.current;
      if (el) {
        const now = el.currentTime * 1000;
        const c = clipRef.current;
        if (c && now >= c.end) {
          el.pause();
          el.currentTime = c.end / 1000;
        }
        setMs(c ? Math.min(now, c.end) : now);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const seek = useCallback(
    (to: number, play = false) => {
      const el = mediaRef.current;
      const clamped = Math.max(0, Math.min(to, durationMs));
      const c = clipRef.current;
      if (c && (clamped < c.start - 500 || clamped > c.end)) setClip(null);
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
    const c = clipRef.current;
    // Replaying a finished clip starts it over.
    if (el.paused && c && el.currentTime * 1000 >= c.end - 50) el.currentTime = c.start / 1000;
    if (el.paused) void el.play();
    else el.pause();
  }, []);

  const playClip = useCallback(
    (start: number, end: number, title: string) => {
      const c = { start, end, title };
      clipRef.current = c;
      setClip(c);
      seek(start, true);
    },
    [seek],
  );

  const highlightLastMoment = useCallback(() => {
    const now = (mediaRef.current?.currentTime ?? 0) * 1000;
    mediaRef.current?.pause();
    setComposer(snapToLines(segments, Math.max(0, now - 15_000), Math.max(now, 1000)));
  }, [segments]);

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
        h: highlightLastMoment,
      };
      const action = actions[e.key];
      if (!action) return;
      e.preventDefault();
      action();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [seek, togglePlay, highlightLastMoment]);

  const activeIndex = segmentAt(segments, ms);
  const active = activeIndex >= 0 ? segments[activeIndex] : null;
  const speakingId = active && ms <= active.end_ms ? active.participant_id : null;
  const chapter = chapters.findLast((c) => c.start_ms <= ms) ?? null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return segments.flatMap((s, i) => (textOf(s).toLowerCase().includes(q) ? [i] : []));
  }, [query, segments, textOf]);

  return (
    // Phones: player, then tabs (Transcript is one of them). Desktop: player and panels left, transcript right.
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

          {clip && (
            <div className="flex items-center gap-3 bg-amber-100 px-4 py-2 text-sm text-[#1a1a18]">
              <span className="rounded bg-amber-300 px-1.5 py-px text-[11px] font-semibold uppercase tracking-wide">Clip</span>
              <span className="min-w-0 flex-1 truncate">{clip.title}</span>
              <span className="font-mono text-xs tabular-nums">
                {formatTimestamp(Math.max(0, ms - clip.start))} / {formatTimestamp(clip.end - clip.start)}
              </span>
              <button onClick={() => setClip(null)} className="rounded px-2 py-0.5 text-xs font-medium hover:bg-amber-200">
                Exit clip
              </button>
            </div>
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
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={highlightLastMoment}
                disabled={!segments.length}
                title="Highlight the last 15 seconds (H)"
                className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-[#1a1a18] hover:bg-amber-100 disabled:opacity-40"
              >
                <span aria-hidden>✦</span> Highlight
              </button>
              <button
                onClick={changeRate}
                className="rounded-md border border-border px-2 py-1 font-mono text-xs tabular-nums hover:bg-surface-2"
                aria-label="Playback speed"
              >
                {rate}×
              </button>
            </div>
          </div>

          <Timeline
            durationMs={durationMs}
            ms={ms}
            participants={participants}
            segments={segments}
            chapters={chapters}
            highlights={highlights}
            clip={clip}
            matchTimes={matches.map((i) => segments[i].start_ms)}
            onSeek={seek}
          />
        </section>
      </div>

      <div className="min-w-0 lg:col-start-1 lg:row-start-2">
        <Panels
          tab={tab}
          onTabChange={setTab}
          meetingId={meetingId}
          templates={templates}
          summaries={summaries}
          ms={ms}
          durationMs={durationMs}
          participants={participants}
          chapters={chapters}
          actionItems={actionItems}
          highlights={highlights}
          excerptOf={excerptOf}
          onSeek={seek}
          onPlayClip={(h) => playClip(h.start_ms, h.end_ms, clipTitle({ title: h.title, excerpt: excerptOf(h) }))}
          onDeleteHighlight={async (h) => {
            const res = await fetch(`/api/highlights/${h.id}`, { method: "DELETE" });
            if (res.ok) setHighlights((list) => list.filter((x) => x.id !== h.id));
          }}
        />
      </div>

      <Transcript
        participants={participants}
        segments={segments}
        activeIndex={activeIndex}
        playing={playing}
        query={query}
        onQueryChange={setQuery}
        matches={matches}
        highlights={highlights}
        textOf={textOf}
        scriptMode={hinglish ? scriptMode : null}
        onScriptChange={changeScript}
        onSeek={seek}
        hiddenOnPhone={tab !== "transcript"}
        onHighlightRange={(start, end) => {
          mediaRef.current?.pause();
          setComposer({ start, end });
        }}
      />

      {composer && (
        <HighlightComposer
          meetingId={meetingId}
          segments={segments}
          textOf={textOf}
          durationMs={durationMs}
          range={composer}
          onPreview={(start, end) => playClip(start, end, "Preview")}
          onClose={() => setComposer(null)}
          onSaved={(h) => {
            setHighlights((list) => [...list, h].sort((a, b) => a.start_ms - b.start_ms));
            setComposer(null);
            setClip(null);
          }}
        />
      )}
    </div>
  );

  function mediaHandlers() {
    return {
      onPlay: () => setPlaying(true),
      onPause: () => setPlaying(false),
      onEnded: () => setPlaying(false),
      onSeeked: (e: React.SyntheticEvent<HTMLMediaElement>) => setMs(e.currentTarget.currentTime * 1000),
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
