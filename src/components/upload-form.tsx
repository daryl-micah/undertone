"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Stage = { kind: "idle" } | { kind: "working"; message: string } | { kind: "error"; message: string };

function durationOf(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement(file.type.startsWith("video/") ? "video" : "audio");
    el.preload = "metadata";
    el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : null);
    el.onerror = () => resolve(null);
    el.src = URL.createObjectURL(file);
  });
}

/** meetingId attaches the recording to an existing meeting (from the calendar). */
export function UploadForm({ meetingId: existingMeetingId }: { meetingId?: string } = {}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const busy = stage.kind === "working";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    try {
      setStage({ kind: "working", message: "Preparing upload" });
      const created = await fetch("/api/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          fileName: file.name,
          mime: file.type,
          size: file.size,
          durationMs: await durationOf(file),
          meetingId: existingMeetingId,
        }),
      });
      const { meetingId, uploadUrl, error } = await created.json();
      if (!created.ok) throw new Error(error ?? "Couldn't start the upload");

      setStage({ kind: "working", message: `Uploading ${(file.size / 1024 / 1024).toFixed(1)} MB` });
      const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);

      const res = await fetch(`/api/uploads/${meetingId}/process`, { method: "POST" });
      if (!res.body) throw new Error(`Processing failed (${res.status})`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const msg = JSON.parse(line) as { progress?: string; done?: boolean; error?: string };
          if (msg.progress) setStage({ kind: "working", message: msg.progress });
          if (msg.error) throw new Error(msg.error);
          if (msg.done) {
            finished = true;
            router.push(`/meetings/${meetingId}`);
            router.refresh();
          }
        }
      }
      // A cut-off stream (timeout, dropped connection) would otherwise spin forever.
      if (!finished) throw new Error("Processing didn't finish. Refresh the meeting page in a minute to check on it.");
    } catch (err) {
      setStage({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-surface p-5">
      <label className="block">
        <span className="text-sm font-medium">Recording</span>
        <input
          type="file"
          accept="audio/*,video/mp4,video/webm"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1.5 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-sm file:text-accent"
        />
      </label>
      <label className={existingMeetingId ? "hidden" : "block"}>
        <span className="text-sm font-medium">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
          maxLength={120}
          placeholder={file ? file.name.replace(/\.[^.]+$/, "") : "Weekly sync"}
          className="mt-1.5 w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
      </label>

      {stage.kind === "working" && (
        <p className="flex items-center gap-2 text-sm" aria-live="polite">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          {stage.message}…
        </p>
      )}
      {stage.kind === "error" && <p className="text-sm text-rose-600">{stage.message}</p>}

      <button
        type="submit"
        disabled={!file || busy}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Working…" : "Upload and transcribe"}
      </button>
      <p className="text-xs text-muted">Transcription takes about a minute for a short call. Keep this page open.</p>
    </form>
  );
}
