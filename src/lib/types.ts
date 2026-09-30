// Row types mirroring supabase/migrations. Times inside a recording are ms.

export type MeetingPlatform = "zoom" | "meet" | "teams" | "upload";
export type MeetingStatus = "scheduled" | "joining" | "recording" | "processing" | "ready" | "failed";
export type MediaKind = "video" | "audio" | "thumbnail";
export type GenerationStatus = "pending" | "generating" | "ready" | "failed";
export type ShareTarget = "meeting" | "highlight";

export interface Meeting {
  id: string;
  title: string;
  platform: MeetingPlatform;
  status: MeetingStatus;
  calendar_event_id: string | null;
  scheduled_start: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number | null;
  language: string;
  created_at: string;
}

export interface Participant {
  id: string;
  meeting_id: string;
  name: string;
  email: string | null;
  is_host: boolean;
  is_external: boolean;
  color: string | null;
  talk_time_ms: number;
}

export interface MediaAsset {
  id: string;
  meeting_id: string;
  kind: MediaKind;
  storage_path: string;
  mime: string;
  duration_ms: number | null;
  size_bytes: number | null;
}

export interface TranscriptSegment {
  id: string;
  meeting_id: string;
  seq: number;
  participant_id: string | null;
  speaker_label: string;
  start_ms: number;
  end_ms: number;
  text: string;
}

export interface Chapter {
  id: string;
  meeting_id: string;
  start_ms: number;
  end_ms: number;
  title: string;
  summary: string | null;
}

export interface SummaryTemplate {
  id: string;
  key: string;
  name: string;
  description: string;
  prompt: string;
  sections: { key: string; title: string; instructions?: string }[];
  sort_order: number;
}

export interface SummaryContent {
  sections: { key: string; title: string; bullets: { text: string; source_ms: number | null }[] }[];
}

export interface Summary {
  id: string;
  meeting_id: string;
  template_id: string;
  status: GenerationStatus;
  content: SummaryContent | null;
  model: string | null;
  error: string | null;
}

export interface ActionItem {
  id: string;
  meeting_id: string;
  text: string;
  assignee_participant_id: string | null;
  assignee_name: string | null;
  due_hint: string | null;
  source_ms: number | null;
  completed_at: string | null;
}

export interface Highlight {
  id: string;
  meeting_id: string;
  start_ms: number;
  end_ms: number;
  title: string | null;
  note: string | null;
  excerpt: string | null;
  created_by_name: string;
  created_at: string;
}

export interface ShareLink {
  id: string;
  token: string;
  target_type: ShareTarget;
  target_id: string;
  created_at: string;
  expires_at: string | null;
  view_count: number;
}

export interface CalendarEvent {
  id: string;
  provider: string;
  external_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  join_url: string | null;
  platform: MeetingPlatform | null;
  attendees: { name: string; email?: string }[];
  auto_record: boolean;
}
