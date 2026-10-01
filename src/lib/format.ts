/** 83_000 -> "1:23", 3_723_000 -> "1:02:03" */
export function formatTimestamp(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** 3_723_000 -> "1h 2m", 95_000 -> "2m", 20_000 -> "20s" */
export function formatDuration(ms: number | null) {
  if (ms == null) return "—";
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total}s`;
  const h = Math.floor(total / 3600);
  const m = Math.round((total % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// The product is for Indian teams, so wall-clock times are shown in IST. Rendering
// on the server in a fixed zone also avoids hydration mismatches.
export const TIME_ZONE = "Asia/Kolkata";

export function formatMeetingDate(iso: string | null) {
  if (!iso) return "Not started";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

/** "10:30" in IST. */
export function formatClock(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE }).format(new Date(iso));
}

/** "Today", "Tomorrow" or "Fri 3 Oct", by IST calendar day. */
export function formatDayLabel(iso: string, now = new Date()) {
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(d); // YYYY-MM-DD
  const target = day(new Date(iso));
  if (target === day(now)) return "Today";
  if (target === day(new Date(now.getTime() + 86_400_000))) return "Tomorrow";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TIME_ZONE }).format(
    new Date(iso),
  );
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** A highlight's title, or its opening words when it has none. */
export function clipTitle(h: { title: string | null; excerpt: string | null }) {
  return h.title ?? (h.excerpt ? h.excerpt.split(/\s+/).slice(0, 8).join(" ") + "…" : "Untitled highlight");
}
