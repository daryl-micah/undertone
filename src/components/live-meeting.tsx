"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { UploadForm } from "@/components/upload-form";
import { formatTimestamp, initials } from "@/lib/format";
import { speakerColor } from "@/lib/speakers";
import type { MeetingPlatform, MeetingStatus } from "@/lib/types";

const PLATFORM = { zoom: "Zoom", meet: "Google Meet", teams: "Microsoft Teams", upload: "the call" } as const;

// The notetaker's states while a meeting is in progress. The bot itself is
// simulated in this demo: it "joins" and "records", and the actual audio comes
// from uploading the recording once it stops.
export function LiveMeeting({
  meetingId,
  status,
  platform,
  startedAt,
  durationMs,
  participants,
}: {
  meetingId: string;
  status: MeetingStatus;
  platform: MeetingPlatform;
  startedAt: string | null;
  durationMs: number | null;
  participants: { id: string; name: string; color: string | null }[];
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function advance(next: "recording" | "processing") {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/meetings/${meetingId}/notetaker`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) setError((await res.json()).error ?? "Something went wrong");
    router.refresh();
    setBusy(false);
  }

  // Joining: the host "admits" the notetaker after a few seconds.
  useEffect(() => {
    if (status !== "joining") return;
    const t = setTimeout(() => void advance("recording"), 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (status !== "recording") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [status]);

  const elapsed = startedAt ? Math.max(0, now - Date.parse(startedAt)) : 0;

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="bg-[#101014] p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {participants.map((p, i) => (
              <div key={p.id} className="relative flex aspect-[16/9] items-center justify-center rounded-lg bg-[#1c1c22]">
                <span
                  className="grid h-10 w-10 place-items-center rounded-full text-xs font-semibold text-on-spk"
                  style={{ background: speakerColor(p.color, i) }}
                >
                  {initials(p.name)}
                </span>
                <span className="absolute bottom-1.5 left-2 right-2 truncate text-[11px] text-white/85">{p.name}</span>
              </div>
            ))}
            <div className="relative flex aspect-[16/9] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/20 bg-[#16161b]">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-xs font-semibold text-white">u</span>
              <span className="text-[11px] text-white/85">Undertone Notetaker</span>
              {status === "joining" && <span className="text-[10px] text-white/50">in the waiting room</span>}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3">
          {status === "joining" && (
            <p className="flex items-center gap-2 text-sm">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
              Asking to join {PLATFORM[platform]}… the host needs to let the notetaker in.
            </p>
          )}
          {status === "recording" && (
            <>
              <p className="flex items-center gap-2 text-sm font-medium">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-600" />
                Recording
                <span className="font-mono tabular-nums text-muted">{formatTimestamp(elapsed)}</span>
              </p>
              <button
                onClick={() => void advance("processing")}
                disabled={busy}
                className="ml-auto rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Stop recording
              </button>
            </>
          )}
          {status === "processing" && (
            <p className="text-sm">
              Recording stopped{durationMs ? ` after ${formatTimestamp(durationMs)}` : ""}.
            </p>
          )}
        </div>
      </section>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <p className="rounded-lg bg-surface-2 px-4 py-3 text-xs text-muted">
        <span className="font-medium text-text">Demo:</span> the meeting bot is simulated, so it joins and
        &ldquo;records&rdquo; without capturing audio. Upload the recording when the call ends, and it goes through the
        same transcription as a real capture: Hindi, English or both mixed.
      </p>

      {status === "processing" && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Upload the recording</h2>
          <UploadForm meetingId={meetingId} />
        </section>
      )}
    </div>
  );
}
