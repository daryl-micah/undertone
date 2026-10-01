import { parseMeetingLink } from "@/lib/meeting-link";
import { db } from "@/lib/supabase";

const PLATFORM = { zoom: "Zoom", meet: "Google Meet", teams: "Teams" } as const;

// POST {url} -> {meetingId}: send the (simulated) notetaker into a meeting by link,
// like pasting a link into Fathom. Same flow as a calendar event from here on.
export async function POST(request: Request) {
  const { url } = (await request.json().catch(() => ({}))) as { url?: string };
  const link = parseMeetingLink(url ?? "");
  if (!link) {
    return Response.json({ error: "Paste a Zoom, Google Meet or Microsoft Teams meeting link" }, { status: 400 });
  }
  const now = new Date();
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(now);
  const { data, error } = await db()
    .from("meetings")
    .insert({
      title: `${PLATFORM[link.platform]} call · ${time}`,
      platform: link.platform,
      status: "joining",
      join_url: link.url,
      scheduled_start: now.toISOString(),
    })
    .select("id")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ meetingId: data.id }, { status: 201 });
}
