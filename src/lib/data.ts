import "server-only";
import { db, mediaUrl } from "./supabase";
import type {
  ActionItem,
  Chapter,
  Highlight,
  MediaAsset,
  Meeting,
  Participant,
  TranscriptSegment,
} from "./types";

export type MeetingListItem = Meeting & { participants: Pick<Participant, "id" | "name" | "color">[] };

export async function listMeetings(): Promise<MeetingListItem[]> {
  const { data, error } = await db()
    .from("meetings")
    .select("*, participants(id, name, color)")
    .order("started_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data as MeetingListItem[];
}

// Supabase caps every response at 1000 rows server-side, and an hour-long call
// has more segments than that, so page through them.
const PAGE = 1000;
async function allSegments(meetingId: string): Promise<TranscriptSegment[]> {
  const rows: TranscriptSegment[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db()
      .from("transcript_segments")
      .select("id, meeting_id, seq, participant_id, speaker_label, start_ms, end_ms, text")
      .eq("meeting_id", meetingId)
      .order("seq")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data as TranscriptSegment[]));
    if (data.length < PAGE) return rows;
  }
}

export interface MeetingDetail {
  meeting: Meeting;
  participants: Participant[];
  segments: TranscriptSegment[];
  chapters: Chapter[];
  actionItems: ActionItem[];
  highlights: Highlight[];
  media: (MediaAsset & { url: string })[];
}

export async function getMeeting(id: string): Promise<MeetingDetail | null> {
  const client = db();
  const { data: meeting, error } = await client.from("meetings").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!meeting) return null;

  const [participants, segments, chapters, actionItems, highlights, media] = await Promise.all([
    client.from("participants").select("*").eq("meeting_id", id).order("talk_time_ms", { ascending: false }),
    allSegments(id),
    client.from("chapters").select("*").eq("meeting_id", id).order("start_ms"),
    client.from("action_items").select("*").eq("meeting_id", id).order("source_ms"),
    client.from("highlights").select("*").eq("meeting_id", id).order("start_ms"),
    client.from("media_assets").select("*").eq("meeting_id", id),
  ]);
  for (const r of [participants, chapters, actionItems, highlights, media]) {
    if (r.error) throw r.error;
  }

  return {
    meeting: meeting as Meeting,
    participants: participants.data as Participant[],
    segments,
    chapters: chapters.data as Chapter[],
    actionItems: actionItems.data as ActionItem[],
    highlights: highlights.data as Highlight[],
    media: (media.data as MediaAsset[]).map((m) => ({ ...m, url: mediaUrl(m.storage_path) })),
  };
}
