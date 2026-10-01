import { generateSummary } from "@/lib/summarize";
import { db } from "@/lib/supabase";
import { badBody, isUuid, notFound, readJson } from "@/lib/http";

// The first summary of a long meeting condenses it chapter by chapter under Groq's
// rate limit, which can take a couple of minutes.
export const maxDuration = 300;

// POST {template, force?} -> NDJSON stream: {"progress": "..."} lines, then
// {"summary": {...}} or {"error": "..."}.
export async function POST(request: Request, ctx: RouteContext<"/api/meetings/[id]/summaries">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound("meeting not found");
  const body = await readJson<{ template: string; force: boolean }>(request);
  if (!body) return badBody();
  const { template, force } = body;
  if (!template) return Response.json({ error: "template is required" }, { status: 400 });

  if (!force) {
    const { data: summary } = await db()
      .from("summaries")
      .select("*, summary_templates!inner()")
      .eq("meeting_id", id)
      .eq("summary_templates.key", template)
      .eq("status", "ready")
      .maybeSingle();
    if (summary) {
      return new Response(JSON.stringify({ summary }) + "\n", { headers: { "content-type": "application/x-ndjson" } });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const summary = await generateSummary(id, template, (progress) => send({ progress }));
        send({ summary });
      } catch (e) {
        send({ error: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
