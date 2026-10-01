import { demoEvents } from "@/lib/demo-calendar";
import { db } from "@/lib/supabase";

// Stubbed Google Calendar: connecting loads sample events placed around "now".
// Reconnecting refreshes their times.
export async function POST() {
  const { data, error } = await db()
    .from("calendar_events")
    .upsert(demoEvents(), { onConflict: "provider,external_id" })
    .select("id");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ connected: true, events: data.length });
}

export async function DELETE() {
  const { error } = await db().from("calendar_events").delete().eq("provider", "google").like("external_id", "demo-%");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ connected: false });
}
