import type { Highlight, ScriptMode, TranscriptSegment } from "./types";

export const SCRIPT_MODES: { key: ScriptMode; label: string }[] = [
  { key: "mixed", label: "Mixed" },
  { key: "romanized", label: "Romanized" },
  { key: "english", label: "English" },
];

/** ?script= value -> mode (anything unknown reads as spoken). */
export function parseScriptMode(value: unknown): ScriptMode {
  return value === "romanized" || value === "english" ? value : "mixed";
}

/** A line in the chosen form; lines without Hindi have only their original text. */
export function segmentText(s: Pick<TranscriptSegment, "text" | "text_romanized" | "text_english">, mode: ScriptMode) {
  if (mode === "romanized") return s.text_romanized ?? s.text;
  if (mode === "english") return s.text_english ?? s.text;
  return s.text;
}

export function excerptText(h: Pick<Highlight, "excerpt" | "excerpt_romanized" | "excerpt_english">, mode: ScriptMode) {
  if (mode === "romanized") return h.excerpt_romanized ?? h.excerpt;
  if (mode === "english") return h.excerpt_english ?? h.excerpt;
  return h.excerpt;
}

/** "Hinglish · 55% Hindi" for code-mixed meetings; null for English-only ones. */
export function languageBadge(m: { language_mix: string; hindi_ratio: number }) {
  if (m.language_mix === "hi-en") return `Hinglish · ${Math.round(m.hindi_ratio * 100)}% Hindi`;
  if (m.language_mix === "hi") return "Hindi";
  return null;
}
