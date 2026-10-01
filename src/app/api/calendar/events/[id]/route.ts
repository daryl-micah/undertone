import { db } from "@/lib/supabase";

// PATCH {auto_record: boolean}: whether the notetaker joins this event.
export async function PATCH(request: Request, ctx: RouteContext<"/api/calendar/events/[id]">) {
  const { id } = await ctx.params;
  const { auto_record } = (await request.json()) as { auto_record?: boolean };
  if (typeof auto_record !== "boolean") return Response.json({ error: "auto_record must be a boolean" }, { status: 400 });
  const { data, error } = await db().from("calendar_events").update({ auto_record }).eq("id", id).select("*").maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(data);
}
