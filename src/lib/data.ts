import "server-only";
import { db, mediaUrl } from "./supabase";
import type {
  ActionItem,
  CalendarEvent,
  Chapter,
  Highlight,
  MediaAsset,
  Meeting,
  MeetingPlatform,
  Participant,
  ShareLink,
  Summary,
  SummaryTemplate,
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

export type ActionItemListItem = ActionItem & { meeting_title: string };

export async function listActionItems(): Promise<ActionItemListItem[]> {
  const { data, error } = await db()
    .from("action_items")
    .select("*, meetings(title, started_at)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as (ActionItem & { meetings: { title: string; started_at: string | null } })[])
    .sort((a, b) => (b.meetings.started_at ?? "").localeCompare(a.meetings.started_at ?? "") || (a.source_ms ?? 0) - (b.source_ms ?? 0))
    .map(({ meetings, ...a }) => ({ ...a, meeting_title: meetings.title }));
}

export type HighlightListItem = Highlight & { meeting_title: string; meeting_language_mix: string };

export async function listHighlights(): Promise<HighlightListItem[]> {
  const { data, error } = await db()
    .from("highlights")
    .select("*, meetings(title, language_mix)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data as (Highlight & { meetings: { title: string; language_mix: string } })[]).map(({ meetings, ...h }) => ({
    ...h,
    meeting_title: meetings.title,
    meeting_language_mix: meetings.language_mix,
  }));
}

export interface TranscriptHit {
  meeting_id: string;
  meeting_title: string;
  meeting_started_at: string | null;
  platform: MeetingPlatform;
  language_mix: string;
  seq: number;
  start_ms: number;
  speaker_name: string;
  speaker_color: string | null;
  headline: string; // matched words wrapped in « »
  headline_romanized: string | null;
  headline_english: string | null;
}

export interface HighlightHit {
  id: string;
  meeting_id: string;
  meeting_title: string;
  start_ms: number;
  end_ms: number;
  title: string | null;
  excerpt: string | null;
  created_by_name: string;
}

export interface SearchFilters {
  speaker?: string;
  platform?: MeetingPlatform;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD, inclusive
}

export async function search(q: string, f: SearchFilters) {
  const client = db();
  const dayAfter = (d: string) => new Date(Date.parse(d) + 86_400_000).toISOString();
  const [transcripts, highlights] = await Promise.all([
    client.rpc("search_transcripts", {
      q,
      speaker: f.speaker ?? null,
      platform_filter: f.platform ?? null,
      from_date: f.from ? new Date(f.from).toISOString() : null,
      to_date: f.to ? dayAfter(f.to) : null,
    }),
    // Highlights only honour the text query; the filters are about who said what.
    f.speaker || f.platform || f.from || f.to ? Promise.resolve({ data: [], error: null }) : client.rpc("search_highlights", { q }),
  ]);
  if (transcripts.error) throw transcripts.error;
  if (highlights.error) throw highlights.error;
  return { transcripts: transcripts.data as TranscriptHit[], highlights: highlights.data as HighlightHit[] };
}

/** Everyone who has spoken in any meeting, for the "said by" filter. */
export async function listSpeakers(): Promise<string[]> {
  const { data, error } = await db().from("participants").select("name");
  if (error) throw error;
  return [...new Set(data.map((p) => p.name as string))].sort();
}

// Supabase caps every response at 1000 rows server-side, and an hour-long call
// has more segments than that, so page through them.
const PAGE = 1000;
async function allSegments(meetingId: string): Promise<TranscriptSegment[]> {
  const rows: TranscriptSegment[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db()
      .from("transcript_segments")
      .select("id, meeting_id, seq, participant_id, speaker_label, start_ms, end_ms, text, text_romanized, text_english, hindi_ratio")
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
  templates: SummaryTemplate[];
  summaries: Summary[];
}

export async function getMeeting(id: string): Promise<MeetingDetail | null> {
  const client = db();
  const { data: meeting, error } = await client.from("meetings").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!meeting) return null;

  const [participants, segments, chapters, actionItems, highlights, media, templates, summaries] = await Promise.all([
    client.from("participants").select("*").eq("meeting_id", id).order("talk_time_ms", { ascending: false }),
    allSegments(id),
    client.from("chapters").select("*").eq("meeting_id", id).order("start_ms"),
    client.from("action_items").select("*").eq("meeting_id", id).order("source_ms"),
    client.from("highlights").select("*").eq("meeting_id", id).order("start_ms"),
    client.from("media_assets").select("*").eq("meeting_id", id),
    client.from("summary_templates").select("*").order("sort_order"),
    client.from("summaries").select("*").eq("meeting_id", id),
  ]);
  for (const r of [participants, chapters, actionItems, highlights, media, templates, summaries]) {
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
    templates: templates.data as SummaryTemplate[],
    summaries: summaries.data as Summary[],
  };
}

// --- Sharing --------------------------------------------------------------------

export type SharePage =
  | {
      kind: "highlight";
      share: ShareLink;
      highlight: Highlight;
      meeting: Meeting;
      participants: Participant[];
      segments: TranscriptSegment[];
      media: (MediaAsset & { url: string }) | null;
    }
  | {
      kind: "meeting";
      share: ShareLink;
      meeting: Meeting;
      participants: Participant[];
      summary: Summary | null;
      actionItems: ActionItem[];
    };

/**
 * A shared highlight or meeting by token. countView records a view atomically
 * (the page does; metadata and preview images don't). Expired or unknown tokens
 * return null.
 */
export async function getSharePage(token: string, countView: boolean): Promise<SharePage | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const client = db();
  let share: ShareLink | undefined;
  if (countView) {
    const { data, error } = await client.rpc("record_share_view", { share_token: token });
    if (error) throw error;
    share = (data as ShareLink[])[0];
  } else {
    const { data, error } = await client.from("share_links").select("*").eq("token", token).maybeSingle();
    if (error) throw error;
    share = data && (!data.expires_at || Date.parse(data.expires_at) > Date.now()) ? (data as ShareLink) : undefined;
  }
  if (!share) return null;

  if (share.target_type === "highlight") {
    const { data: highlight } = await client.from("highlights").select("*").eq("id", share.target_id).maybeSingle();
    if (!highlight) return null;
    const [meeting, participants, segments, media] = await Promise.all([
      client.from("meetings").select("*").eq("id", highlight.meeting_id).single(),
      client.from("participants").select("*").eq("meeting_id", highlight.meeting_id),
      client
        .from("transcript_segments")
        .select("id, meeting_id, seq, participant_id, speaker_label, start_ms, end_ms, text, text_romanized, text_english, hindi_ratio")
        .eq("meeting_id", highlight.meeting_id)
        .lt("start_ms", highlight.end_ms)
        .gt("end_ms", highlight.start_ms)
        .order("seq"),
      client.from("media_assets").select("*").eq("meeting_id", highlight.meeting_id),
    ]);
    for (const r of [meeting, participants, segments, media]) if (r.error) throw r.error;
    const assets = media.data as MediaAsset[];
    const playable = assets.find((m) => m.kind === "video") ?? assets.find((m) => m.kind === "audio");
    return {
      kind: "highlight",
      share,
      highlight: highlight as Highlight,
      meeting: meeting.data as Meeting,
      participants: participants.data as Participant[],
      segments: segments.data as TranscriptSegment[],
      media: playable ? { ...playable, url: mediaUrl(playable.storage_path) } : null,
    };
  }

  const [meeting, participants, summary, actionItems] = await Promise.all([
    client.from("meetings").select("*").eq("id", share.target_id).maybeSingle(),
    client.from("participants").select("*").eq("meeting_id", share.target_id).order("talk_time_ms", { ascending: false }),
    client
      .from("summaries")
      .select("*, summary_templates!inner()")
      .eq("meeting_id", share.target_id)
      .eq("summary_templates.key", "general")
      .eq("status", "ready")
      .maybeSingle(),
    client.from("action_items").select("*").eq("meeting_id", share.target_id).order("source_ms"),
  ]);
  for (const r of [meeting, participants, summary, actionItems]) if (r.error) throw r.error;
  if (!meeting.data) return null;
  return {
    kind: "meeting",
    share,
    meeting: meeting.data as Meeting,
    participants: participants.data as Participant[],
    summary: (summary.data as Summary | null) ?? null,
    actionItems: actionItems.data as ActionItem[],
  };
}

// --- Home -----------------------------------------------------------------------

export type UpcomingEvent = CalendarEvent & {
  live_meeting: { id: string; status: string } | null;
  /** Joinable from 10 minutes before the start until it ends. */
  happening_now: boolean;
};

/** Calendar state for the home page: whether a calendar is connected, and what's next. */
export async function listUpcoming(): Promise<{ connected: boolean; events: UpcomingEvent[] }> {
  const client = db();
  const [{ count }, upcoming] = await Promise.all([
    client.from("calendar_events").select("id", { count: "exact", head: true }),
    client
      .from("calendar_events")
      .select("*")
      .gt("ends_at", new Date().toISOString())
      .order("starts_at")
      .limit(12),
  ]);
  if (upcoming.error) throw upcoming.error;
  const events = upcoming.data as CalendarEvent[];
  const { data: live, error } = events.length
    ? await client
        .from("meetings")
        .select("id, status, calendar_event_id")
        .in("calendar_event_id", events.map((e) => e.id))
        .in("status", ["joining", "recording", "processing", "ready"])
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (error) throw error;
  const now = Date.now();
  return {
    connected: Boolean(count),
    events: events.map((e) => {
      const m = live?.find((x) => x.calendar_event_id === e.id);
      return {
        ...e,
        live_meeting: m ? { id: m.id, status: m.status } : null,
        happening_now: Date.parse(e.starts_at) - 10 * 60_000 <= now && Date.parse(e.ends_at) > now,
      };
    }),
  };
}

/** First line of each meeting's General summary, for previews in lists. */
export async function summaryPreviews(meetingIds: string[]): Promise<Map<string, string>> {
  if (!meetingIds.length) return new Map();
  const { data, error } = await db()
    .from("summaries")
    .select("meeting_id, content, summary_templates!inner()")
    .in("meeting_id", meetingIds)
    .eq("summary_templates.key", "general")
    .eq("status", "ready");
  if (error) throw error;
  return new Map(
    (data as { meeting_id: string; content: Summary["content"] }[]).flatMap((s) => {
      const first = s.content?.sections.find((sec) => sec.bullets.length)?.bullets[0]?.text;
      return first ? [[s.meeting_id, first]] : [];
    }),
  );
}
