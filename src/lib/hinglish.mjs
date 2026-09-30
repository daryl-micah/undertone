// Hinglish processing shared by the seed pipeline and the upload path:
// measure how much Hindi each line has, then give every line with Hindi a
// romanized form (as people type it) and an English translation.

import { groqJson } from "./groq-core.mjs";

const DEVANAGARI = /[ऀ-ॿ]/;
const BATCH_CHARS = 2200; // Devanagari is token-heavy; keeps each request well under 8k TPM

/** Share of words written in Devanagari, 0–1. */
export function hindiRatio(text) {
  const words = (text ?? "").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (!words.length) return 0;
  return words.filter((w) => DEVANAGARI.test(w)).length / words.length;
}

/** 'en' | 'hi-en' | 'hi' for a meeting-level Hindi ratio. */
export function languageMix(ratio) {
  if (ratio < 0.05) return "en";
  if (ratio > 0.95) return "hi";
  return "hi-en";
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["lines"],
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "romanized", "english"],
        properties: { id: { type: "string" }, romanized: { type: "string" }, english: { type: "string" } },
      },
    },
  },
};

const SYSTEM =
  "You convert lines from a code-mixed Hindi-English (Hinglish) meeting transcript. For every input line return:\n" +
  "- romanized: the same words in Latin script, the way Indian professionals type Hinglish in chat " +
  "(e.g. \"yaar ye ticket abhi bhi blocked hai\"). Keep English words exactly as they are. " +
  "Use common informal spellings (hai, nahi, kya, karna, hoga), not academic transliteration with diacritics.\n" +
  "- english: a natural, faithful English translation. Keep names, numbers, product and technical terms. Don't add or drop meaning.\n" +
  "Return exactly one output per input line, with the same id. Never merge, split or skip lines.";

async function convertBatch(batch) {
  const out = await groqJson({
    schemaName: "hinglish_lines",
    schema: SCHEMA,
    maxTokens: 4000,
    system: SYSTEM,
    user: JSON.stringify({ lines: batch.map((s) => ({ id: s.id, text: s.text })) }),
  });
  const byId = new Map(out.lines.map((l) => [l.id, l]));
  const complete = byId.size === batch.length && batch.every((s) => byId.has(s.id));
  return complete ? batch.map((s) => byId.get(s.id)) : null;
}

/**
 * Romanize and translate lines, batched. Guarantees exactly one result per
 * input id: an incomplete batch is retried once, then split in half.
 * @param {{ id: string, text: string }[]} lines
 * @param {(msg: string) => void} [progress]
 * @returns {Promise<Map<string, { romanized: string, english: string }>>}
 */
export async function romanizeAndTranslate(lines, progress = () => {}) {
  const batches = [];
  let current = [];
  let size = 0;
  for (const line of lines) {
    if (current.length && size + line.text.length > BATCH_CHARS) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(line);
    size += line.text.length;
  }
  if (current.length) batches.push(current);

  const result = new Map();
  async function run(batch, depth = 0) {
    let converted = await convertBatch(batch);
    if (!converted) converted = await convertBatch(batch);
    if (converted) {
      converted.forEach((c) => result.set(c.id, { romanized: c.romanized, english: c.english }));
      return;
    }
    if (batch.length === 1 || depth > 4) throw new Error(`Groq returned mismatched ids for line ${batch[0].id}`);
    const mid = Math.ceil(batch.length / 2);
    await run(batch.slice(0, mid), depth + 1);
    await run(batch.slice(mid), depth + 1);
  }
  for (const [i, batch] of batches.entries()) {
    progress(`Translating Hinglish (part ${i + 1} of ${batches.length})`);
    await run(batch);
  }
  return result;
}

/**
 * Measure Hindi per line and for the meeting, romanize and translate every line
 * with Hindi, and save it all. Safe to re-run: lines that already have both
 * forms are skipped.
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} meetingId
 * @param {(msg: string) => void} [progress]
 */
export async function processLanguage(db, meetingId, progress = () => {}) {
  const segments = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("transcript_segments")
      .select("id, text, text_romanized, text_english")
      .eq("meeting_id", meetingId)
      .order("seq")
      .range(from, from + 999);
    if (error) throw error;
    segments.push(...data);
    if (data.length < 1000) break;
  }

  const ratios = new Map(segments.map((s) => [s.id, hindiRatio(s.text)]));
  const pending = segments.filter((s) => ratios.get(s.id) > 0 && !(s.text_romanized && s.text_english));
  const converted = pending.length ? await romanizeAndTranslate(pending, progress) : new Map();

  progress("Saving transcript");
  const updates = segments.map((s) => ({ id: s.id, hindi_ratio: ratios.get(s.id), ...converted.get(s.id) }));
  for (let i = 0; i < updates.length; i += 10) {
    await Promise.all(
      updates.slice(i, i + 10).map(async (u) => {
        const row = { hindi_ratio: u.hindi_ratio };
        if (u.romanized) Object.assign(row, { text_romanized: u.romanized, text_english: u.english });
        const { error } = await db.from("transcript_segments").update(row).eq("id", u.id);
        if (error) throw error;
      }),
    );
  }

  // Word-weighted, so a long Hindi monologue counts for more than "haan".
  let hindiWords = 0;
  let words = 0;
  for (const s of segments) {
    const n = s.text.split(/\s+/).filter(Boolean).length;
    words += n;
    hindiWords += n * ratios.get(s.id);
  }
  const ratio = words ? hindiWords / words : 0;
  const { error } = await db
    .from("meetings")
    .update({ hindi_ratio: ratio, language_mix: languageMix(ratio) })
    .eq("id", meetingId);
  if (error) throw error;
  return { ratio, mix: languageMix(ratio), converted: converted.size };
}
