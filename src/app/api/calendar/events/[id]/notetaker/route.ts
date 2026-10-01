import { SPEAKER_COLORS } from "@/lib/speakers";
import { db } from "@/lib/supabase";

// POST: send the (simulated) notetaker into a calendar event. Creates the meeting
// in "joining" with the invitees as participants, or returns the one already live.
export async function POST(_request: Request, ctx: RouteContext<"/api/calendar/events/[id]/notetaker">) {
  const { id } = await ctx.params;
  const client = db();
  const { data: event } = await client.from("calendar_events").select("*").eq("id", id).maybeSingle();
  if (!event) return Response.json({ error: "event not found" }, { status: 404 });
  if (!event.join_url || !event.platform) {
    return Response.json({ error: "This event has no video link, so the notetaker can't join" }, { status: 400 });
  }

  // Only a meeting sent into this occurrence: the demo's live event rolls forward,
  // and an earlier occurrence's unfinished meeting must not be reopened.
  const { data: live } = await client
    .from("meetings")
    .select("id")
    .eq("calendar_event_id", id)
    .in("status", ["joining", "recording", "processing"])
    .gte("created_at", new Date(Date.parse(event.starts_at) - 15 * 60_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (live) return Response.json({ meetingId: live.id });

  const { data: meeting, error } = await client
    .from("meetings")
    .insert({
      title: event.title,
      platform: event.platform,
      status: "joining",
      calendar_event_id: id,
      scheduled_start: event.starts_at,
    })
    .select("id")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const attendees = (event.attendees as { name: string; email?: string }[]) ?? [];
  if (attendees.length) {
    const { error: pErr } = await client.from("participants").insert(
      attendees.map((a, i) => ({
        meeting_id: meeting.id,
        name: a.name,
        email: a.email ?? null,
        is_host: i === 0,
        is_external: false,
        color: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
        talk_time_ms: 0,
      })),
    );
    if (pErr) return Response.json({ error: pErr.message }, { status: 500 });
  }
  return Response.json({ meetingId: meeting.id }, { status: 201 });
}
