import { db } from "@/lib/supabase";

// POST {target_type, target_id, allow_full_meeting?, created_by_name?} -> the share.
// Reuses an existing link for the same target and permission, so sharing the
// same clip twice gives the same URL and one view count.
export async function POST(request: Request) {
  const body = (await request.json()) as {
    target_type?: string;
    target_id?: string;
    allow_full_meeting?: boolean;
    created_by_name?: string;
  };
  const type = body.target_type;
  if (type !== "meeting" && type !== "highlight") {
    return Response.json({ error: "target_type must be meeting or highlight" }, { status: 400 });
  }
  if (!body.target_id || !/^[0-9a-f-]{36}$/i.test(body.target_id)) {
    return Response.json({ error: "target_id is required" }, { status: 400 });
  }
  // A shared meeting is the whole meeting by definition.
  const allowFull = type === "meeting" ? true : Boolean(body.allow_full_meeting);

  const client = db();
  const { data: target } = await client
    .from(type === "meeting" ? "meetings" : "highlights")
    .select("id")
    .eq("id", body.target_id)
    .maybeSingle();
  if (!target) return Response.json({ error: `${type} not found` }, { status: 404 });

  const { data: existing } = await client
    .from("share_links")
    .select("*")
    .eq("target_type", type)
    .eq("target_id", body.target_id)
    .eq("allow_full_meeting", allowFull)
    .is("expires_at", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (existing) return Response.json(existing);

  const { data, error } = await client
    .from("share_links")
    .insert({
      target_type: type,
      target_id: body.target_id,
      allow_full_meeting: allowFull,
      created_by_name: body.created_by_name?.trim().slice(0, 60) || null,
    })
    .select("*")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
