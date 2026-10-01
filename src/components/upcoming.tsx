"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { initials } from "@/lib/format";
import { speakerColor } from "@/lib/speakers";

export interface UpcomingRow {
  id: string;
  title: string;
  day: string; // "Today", "Tomorrow", "Fri 3 Oct" (IST, from the server)
  time: string; // "10:30–11:00"
  platformLabel: string | null;
  attendees: { name: string }[];
  autoRecord: boolean;
  canJoin: boolean; // has a video link
  happeningNow: boolean;
  live: { id: string; status: string } | null;
}

const LIVE_LABEL: Record<string, string> = {
  joining: "Notetaker joining",
  recording: "Recording",
  processing: "Waiting for recording",
  ready: "Notes ready",
};

export function Upcoming({ connected, rows }: { connected: boolean; rows: UpcomingRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function call(key: string, url: string, init: RequestInit) {
    setBusy(key);
    setError("");
    try {
      const res = await fetch(url, init);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong");
      return body;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function connect() {
    if (await call("connect", "/api/calendar/connect", { method: "POST" })) router.refresh();
  }

  if (!connected) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-5 sm:flex-row sm:items-center">
        <div className="flex-1">
          <h2 className="font-medium">Connect your calendar</h2>
          <p className="text-sm text-muted">
            The notetaker joins your Zoom, Meet and Teams calls automatically and takes notes in Hindi, English or both.
          </p>
        </div>
        <button
          onClick={connect}
          disabled={busy === "connect"}
          className="shrink-0 rounded-md border border-border bg-bg px-3 py-1.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
        >
          {busy === "connect" ? "Connecting…" : "Connect Google Calendar"}
        </button>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </section>
    );
  }

  const days = [...new Set(rows.map((r) => r.day))];

  return (
    <section className="rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium">Upcoming</h2>
        <span className="text-xs text-muted">Google Calendar · demo data</span>
        <button
          onClick={async () => (await call("disconnect", "/api/calendar/connect", { method: "DELETE" })) && router.refresh()}
          className="ml-auto text-xs text-muted hover:text-text"
        >
          Disconnect
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-6 text-sm text-muted">
          Nothing coming up.
          <button onClick={connect} className="text-accent hover:underline">
            Refresh calendar
          </button>
        </div>
      ) : (
        days.map((day) => (
          <div key={day}>
            <p className="bg-surface-2/60 px-4 py-1.5 text-xs font-medium text-muted">{day}</p>
            <ul className="divide-y divide-border">
              {rows
                .filter((r) => r.day === day)
                .map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    <span className="hidden w-24 shrink-0 font-mono text-xs tabular-nums text-muted sm:block">{r.time}</span>
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="flex items-center gap-2 text-sm font-medium sm:truncate">
                        {r.happeningNow && <span role="img" className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-rose-600" aria-label="Happening now" />}
                        <span className="line-clamp-2 sm:truncate">{r.title}</span>
                      </p>
                      <p className="text-xs text-muted">
                        <span className="font-mono tabular-nums sm:hidden">{r.time} · </span>
                        {r.platformLabel ?? "No video link"} · {r.attendees.length} people
                      </p>
                    </div>
                    <div className="hidden -space-x-1.5 sm:flex">
                      {r.attendees.slice(0, 4).map((a, i) => (
                        <span
                          key={a.name}
                          title={a.name}
                          className="grid h-6 w-6 place-items-center rounded-full text-[9px] font-semibold text-on-spk ring-2 ring-surface"
                          style={{ background: speakerColor(null, i) }}
                        >
                          {initials(a.name)}
                        </span>
                      ))}
                    </div>

                    {r.live ? (
                      <Link
                        href={`/meetings/${r.live.id}`}
                        className="rounded-md bg-accent-soft px-3 py-1 text-xs font-medium text-accent hover:opacity-90"
                      >
                        {LIVE_LABEL[r.live.status] ?? "Open"} →
                      </Link>
                    ) : r.canJoin && r.happeningNow ? (
                      <button
                        onClick={async () => {
                          const body = await call(r.id, `/api/calendar/events/${r.id}/notetaker`, { method: "POST" });
                          if (body) router.push(`/meetings/${body.meetingId}`);
                        }}
                        disabled={busy === r.id}
                        className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                      >
                        {busy === r.id ? "Sending…" : "Send notetaker now"}
                      </button>
                    ) : r.canJoin ? (
                      <AutoRecordToggle id={r.id} initial={r.autoRecord} />
                    ) : (
                      <span className="text-xs text-muted">Notetaker can&apos;t join</span>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        ))
      )}
      {error && <p className="px-4 pb-3 text-sm text-rose-600">{error}</p>}
    </section>
  );
}

function AutoRecordToggle({ id, initial }: { id: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);
  async function toggle() {
    const next = !on;
    setOn(next);
    setSaving(true);
    const res = await fetch(`/api/calendar/events/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ auto_record: next }),
    });
    if (!res.ok) setOn(!next);
    setSaving(false);
  }
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
      <span className="hidden sm:inline">Notetaker will join</span>
      <button
        role="switch"
        aria-checked={on}
        aria-label="Notetaker will join"
        onClick={toggle}
        disabled={saving}
        className={`relative h-5 w-9 rounded-full transition-colors ${on ? "bg-accent" : "bg-border"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${on ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}
