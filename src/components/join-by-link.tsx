"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Paste a meeting link and send the notetaker in, without a calendar event.
export function JoinByLink() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/meetings/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't send the notetaker");
      router.push(`/meetings/${body.meetingId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-surface p-4">
      <label htmlFor="join-url" className="text-sm font-medium">
        Send the notetaker to a meeting
      </label>
      <p className="text-xs text-muted">
        Start a Zoom, Meet or Teams call (a call with yourself is fine), paste its link, and keep it under 3 minutes.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          id="join-url"
          type="text"
          inputMode="url"
          autoComplete="off"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://meet.google.com/abc-defg-hij"
          className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={!url.trim() || busy}
          className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send notetaker"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </form>
  );
}
