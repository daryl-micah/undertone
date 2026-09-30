import Link from "next/link";
import { connection } from "next/server";
import { AvatarStack } from "@/components/avatar-stack";
import { LanguageBadge } from "@/components/language-badge";
import { SetupNotice } from "@/components/setup-notice";
import { listMeetings } from "@/lib/data";
import { formatDuration, formatMeetingDate } from "@/lib/format";
import { isConfigured } from "@/lib/supabase";
import type { MeetingPlatform, MeetingStatus } from "@/lib/types";

const PLATFORM_LABEL: Record<MeetingPlatform, string> = {
  zoom: "Zoom",
  meet: "Google Meet",
  teams: "Teams",
  upload: "Upload",
};

const STATUS_LABEL: Partial<Record<MeetingStatus, string>> = {
  scheduled: "Scheduled",
  joining: "Notetaker joining",
  recording: "Recording",
  processing: "Processing",
  failed: "Failed",
};

export default async function MeetingsPage() {
  await connection();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
        <p className="text-sm text-muted">Recordings, transcripts and notes from your calls.</p>
      </div>
      {isConfigured() ? <MeetingList /> : <SetupNotice />}
    </div>
  );
}

async function MeetingList() {
  // Hinglish meetings are the product's point, so they're pinned to the top.
  const meetings = (await listMeetings()).sort(
    (a, b) => Number(b.language_mix === "hi-en") - Number(a.language_mix === "hi-en"),
  );

  if (meetings.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted">
        No meetings yet. Once the notetaker records a call it shows up here.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {meetings.map((m) => (
        <li key={m.id}>
          <Link
            href={`/meetings/${m.id}`}
            className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-6"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium">{m.title}</p>
                <LanguageBadge meeting={m} />
                {m.language_mix === "hi-en" && <span className="shrink-0 text-xs text-muted">Pinned</span>}
                {STATUS_LABEL[m.status] && (
                  <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">
                    {STATUS_LABEL[m.status]}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-muted">
                {formatMeetingDate(m.started_at)} · {PLATFORM_LABEL[m.platform]} · {formatDuration(m.duration_ms)} ·{" "}
                {m.participants.length} {m.participants.length === 1 ? "person" : "people"}
              </p>
            </div>
            <AvatarStack people={m.participants} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
