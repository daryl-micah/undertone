import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AvatarStack } from "@/components/avatar-stack";
import { LanguageBadge } from "@/components/language-badge";
import { MeetingView } from "@/components/meeting/meeting-view";
import { SetupNotice } from "@/components/setup-notice";
import { getMeeting } from "@/lib/data";
import { formatDuration, formatMeetingDate } from "@/lib/format";
import { parseScriptMode } from "@/lib/script";
import { isConfigured } from "@/lib/supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PLATFORM_LABEL = { zoom: "Zoom", meet: "Google Meet", teams: "Teams", upload: "Upload" } as const;

export default async function MeetingPage(props: PageProps<"/meetings/[id]">) {
  await connection();
  if (!isConfigured()) return <SetupNotice />;

  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  const detail = await getMeeting(id);
  if (!detail) notFound();

  const { meeting, participants, segments, chapters, actionItems, highlights, media, templates, summaries } = detail;
  if (meeting.status !== "ready" || !segments.length) {
    return (
      <div className="space-y-4">
        <Link href="/" className="text-sm text-muted hover:text-text">
          ← Meetings
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{meeting.title}</h1>
        <p className="rounded-xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted">
          {meeting.status === "failed"
            ? "This recording couldn't be processed. Try uploading it again."
            : meeting.status === "processing"
              ? "Still transcribing this recording. Refresh in a minute."
              : "There's no transcript for this meeting yet."}
        </p>
      </div>
    );
  }

  // ?t=<seconds> deep-links to a moment; ?clip=<highlight id> opens a highlight as a clip.
  const query = await props.searchParams;
  const clip = highlights.find((h) => h.id === query.clip);
  const t = Number(query.t);
  const initialMs = clip ? clip.start_ms : Number.isFinite(t) && t > 0 ? Math.round(t * 1000) : 0;
  const playable = media.find((m) => m.kind === "video") ?? media.find((m) => m.kind === "audio") ?? null;
  const durationMs = meeting.duration_ms ?? segments.at(-1)?.end_ms ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <Link href="/" className="text-sm text-muted hover:text-text">
            ← Meetings
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{meeting.title}</h1>
            <LanguageBadge meeting={meeting} />
          </div>
          <p className="text-sm text-muted">
            {formatMeetingDate(meeting.started_at)} · {PLATFORM_LABEL[meeting.platform]} ·{" "}
            {formatDuration(meeting.duration_ms)} · {participants.length} people
          </p>
        </div>
        <div className="hidden sm:block">
          <AvatarStack people={participants} max={8} />
        </div>
      </div>

      <MeetingView
        meetingId={meeting.id}
        templates={templates}
        summaries={summaries}
        durationMs={durationMs}
        media={playable && { kind: playable.kind, url: playable.url, mime: playable.mime }}
        participants={participants.map((p, index) => ({
          id: p.id,
          name: p.name,
          color: p.color,
          is_external: p.is_external,
          is_host: p.is_host,
          talk_time_ms: p.talk_time_ms,
          index,
        }))}
        segments={segments}
        chapters={chapters}
        actionItems={actionItems}
        highlights={highlights}
        initialMs={Math.min(initialMs, durationMs)}
        initialClipId={clip?.id}
        initialQuery={typeof query.q === "string" ? query.q : ""}
        languageMix={meeting.language_mix}
        initialScript={parseScriptMode(query.script)}
      />
    </div>
  );
}
