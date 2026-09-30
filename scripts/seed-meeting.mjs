// Fake capture layer: turn a written meeting script into a real recording + transcript.
//
//   node --env-file=.env.local scripts/seed-meeting.mjs <slug>            voice + load
//   node --env-file=.env.local scripts/seed-meeting.mjs <slug> --no-load  voice only
//
// Reads seed/meetings/<slug>.json (meta + cast) and seed/meetings/<slug>.script:
//   ## Chapter title
//   key: Spoken line. {action: What to do; due: Friday; owner: otherkey}
//
// Each line is voiced separately with Sarvam TTS (cached in media/tts-cache/), then
// the clips are laid end to end with short pauses, so every segment's start/end ms
// is exact. The timeline is encoded to one MP3 and loaded into Supabase, replacing
// any previous copy of the meeting.

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import ffmpegPath from "ffmpeg-static";

const SAMPLE_RATE = 22050;
const TTS_MODEL = "bulbul:v3";
const CONCURRENCY = 4;

const [slug, ...flags] = process.argv.slice(2);
if (!slug) {
  console.error("usage: seed-meeting.mjs <slug> [--no-load]");
  process.exit(1);
}

const meta = JSON.parse(await readFile(`seed/meetings/${slug}.json`, "utf8"));
const { lines, chapters } = parseScript(await readFile(`seed/meetings/${slug}.script`, "utf8"), meta);
console.log(`${slug}: ${lines.length} lines, ${chapters.length} chapters, ${meta.participants.length} people`);

const clips = await voiceAll(lines, meta);
const { pcm, timings } = layOut(lines, clips, chapters);
const durationMs = Math.round((pcm.length / 2 / SAMPLE_RATE) * 1000);
const mp3Path = `media/${slug}.mp3`;
await encodeMp3(pcm, mp3Path);
console.log(`audio: ${mp3Path} (${(durationMs / 60000).toFixed(1)} min)`);

if (!flags.includes("--no-load")) await load(meta, lines, chapters, timings, durationMs, mp3Path);

// ---------------------------------------------------------------------------

function parseScript(text, meta) {
  const keys = new Set(meta.participants.map((p) => p.key));
  const lines = [];
  const chapters = [];
  text.split("\n").forEach((raw, n) => {
    const row = raw.trim();
    if (!row || row.startsWith("//")) return;
    if (row.startsWith("## ")) {
      chapters.push({ title: row.slice(3).trim(), line: lines.length });
      return;
    }
    const m = row.match(/^([a-z]+):\s*(.+)$/);
    if (!m || !keys.has(m[1])) throw new Error(`${slug}.script:${n + 1}: bad line: ${row}`);
    let spoken = m[2];
    let action = null;
    const tag = spoken.match(/\{action:([^}]*)\}\s*$/);
    if (tag) {
      spoken = spoken.slice(0, tag.index).trim();
      const [what, ...rest] = tag[1].split(";").map((s) => s.trim());
      action = { text: what, owner: m[1] };
      for (const kv of rest) {
        const [k, v] = kv.split(":").map((s) => s.trim());
        if (k === "due") action.due = v;
        if (k === "owner") action.owner = v;
      }
      if (!keys.has(action.owner)) throw new Error(`${slug}.script:${n + 1}: unknown owner ${action.owner}`);
    }
    lines.push({ speaker: m[1], text: spoken, action });
  });
  if (chapters[0]?.line !== 0) throw new Error(`${slug}.script must start with a ## chapter`);
  return { lines, chapters };
}

async function voiceAll(lines, meta) {
  if (!process.env.SARVAM_API_KEY) throw new Error("SARVAM_API_KEY is not set");
  await mkdir("media/tts-cache", { recursive: true });
  const voiceOf = Object.fromEntries(meta.participants.map((p) => [p.key, p]));
  const clips = new Array(lines.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < lines.length) {
      const i = next++;
      const p = voiceOf[lines[i].speaker];
      clips[i] = await synth(lines[i].text, p.voice, p.pace ?? 1.0);
      if (++done % 25 === 0 || done === lines.length) console.log(`voiced ${done}/${lines.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return clips;
}

async function synth(text, voice, pace) {
  const key = createHash("sha1").update(JSON.stringify([TTS_MODEL, voice, pace, SAMPLE_RATE, text])).digest("hex");
  const file = `media/tts-cache/${key}.wav`;
  if (existsSync(file)) return wavToPcm(await readFile(file));

  for (let attempt = 1; ; attempt++) {
    const res = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: { "api-subscription-key": process.env.SARVAM_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        text,
        language_code: "en-IN",
        model: TTS_MODEL,
        speaker: voice,
        pace,
        speech_sample_rate: SAMPLE_RATE,
        output_audio_codec: "wav",
      }),
    });
    if (res.ok) {
      const wav = Buffer.from((await res.json()).audios.join(""), "base64");
      await writeFile(file, wav);
      return wavToPcm(wav);
    }
    const body = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    throw new Error(`Sarvam TTS ${res.status}: ${body.slice(0, 500)}`);
  }
}

// Mono 16-bit PCM from a WAV buffer; checks the format rather than assuming it.
function wavToPcm(buf) {
  let off = 12;
  let fmt = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") {
      fmt = { channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    } else if (id === "data") {
      if (!fmt || fmt.channels !== 1 || fmt.bits !== 16 || fmt.rate !== SAMPLE_RATE) {
        throw new Error(`unexpected WAV format ${JSON.stringify(fmt)}`);
      }
      // Some encoders write a placeholder size for streamed WAVs; clamp to the buffer.
      return buf.subarray(off + 8, Math.min(buf.length, off + 8 + size));
    }
    off += 8 + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
}

// Deterministic pauses so re-running produces identical timings.
function layOut(lines, clips, chapters) {
  const chapterStarts = new Set(chapters.map((c) => c.line));
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const silence = (ms) => Buffer.alloc(Math.round((ms / 1000) * SAMPLE_RATE) * 2);

  const parts = [];
  const timings = [];
  let cursor = 0;
  lines.forEach((line, i) => {
    const pause = i === 0 ? 400 : chapterStarts.has(i) ? 1400 + rand() * 600 : 350 + rand() * 750;
    parts.push(silence(pause));
    cursor += Math.round((Math.round((pause / 1000) * SAMPLE_RATE) / SAMPLE_RATE) * 1000);
    const ms = Math.round((clips[i].length / 2 / SAMPLE_RATE) * 1000);
    timings.push({ start: cursor, end: cursor + ms });
    parts.push(clips[i]);
    cursor += ms;
  });
  parts.push(silence(1500));
  return { pcm: Buffer.concat(parts), timings };
}

function encodeMp3(pcm, out) {
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, [
      "-y", "-loglevel", "error",
      "-f", "s16le", "-ar", String(SAMPLE_RATE), "-ac", "1", "-i", "pipe:0",
      "-codec:a", "libmp3lame", "-b:a", "64k", out,
    ]);
    ff.stderr.on("data", (d) => process.stderr.write(d));
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
    ff.stdin.end(pcm);
  });
}

async function load(meta, lines, chapters, timings, durationMs, mp3Path) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const must = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };

  const storagePath = `meetings/${slug}.mp3`;
  const mp3 = await readFile(mp3Path);
  must(await supabase.storage.from("media").upload(storagePath, mp3, { contentType: "audio/mpeg", upsert: true }));

  // Replace the meeting wholesale; child rows cascade.
  must(await supabase.from("meetings").delete().eq("id", meta.id));
  const startedAt = new Date(meta.started_at);
  must(
    await supabase.from("meetings").insert({
      id: meta.id,
      title: meta.title,
      platform: meta.platform,
      status: "ready",
      started_at: startedAt.toISOString(),
      ended_at: new Date(startedAt.getTime() + durationMs).toISOString(),
      scheduled_start: startedAt.toISOString(),
      duration_ms: durationMs,
    }),
  );

  const talk = {};
  lines.forEach((l, i) => (talk[l.speaker] = (talk[l.speaker] ?? 0) + timings[i].end - timings[i].start));
  const people = must(
    await supabase
      .from("participants")
      .insert(
        meta.participants.map((p) => ({
          meeting_id: meta.id,
          name: p.name,
          email: p.email,
          is_host: Boolean(p.is_host),
          is_external: Boolean(p.is_external),
          color: p.color,
          talk_time_ms: talk[p.key] ?? 0,
        })),
      )
      .select("id, name"),
  );
  const idOf = Object.fromEntries(meta.participants.map((p) => [p.key, people.find((x) => x.name === p.name).id]));
  const labelOf = Object.fromEntries(meta.participants.map((p, i) => [p.key, `SPEAKER_${String(i).padStart(2, "0")}`]));

  const segments = lines.map((l, i) => ({
    meeting_id: meta.id,
    seq: i + 1,
    participant_id: idOf[l.speaker],
    speaker_label: labelOf[l.speaker],
    start_ms: timings[i].start,
    end_ms: timings[i].end,
    text: l.text,
  }));
  for (let i = 0; i < segments.length; i += 500) {
    must(await supabase.from("transcript_segments").insert(segments.slice(i, i + 500)));
  }

  must(
    await supabase.from("chapters").insert(
      chapters.map((c, i) => ({
        meeting_id: meta.id,
        title: c.title,
        start_ms: Math.max(0, timings[c.line].start - 400),
        end_ms: i + 1 < chapters.length ? Math.max(0, timings[chapters[i + 1].line].start - 400) : durationMs,
      })),
    ),
  );

  const nameOf = Object.fromEntries(meta.participants.map((p) => [p.key, p.name]));
  const actions = lines.flatMap((l, i) =>
    l.action
      ? [{
          meeting_id: meta.id,
          text: l.action.text,
          assignee_participant_id: idOf[l.action.owner],
          assignee_name: nameOf[l.action.owner],
          due_hint: l.action.due ?? null,
          source_ms: timings[i].start,
        }]
      : [],
  );
  if (actions.length) must(await supabase.from("action_items").insert(actions));

  must(
    await supabase.from("media_assets").insert({
      meeting_id: meta.id,
      kind: "audio",
      storage_path: storagePath,
      mime: "audio/mpeg",
      duration_ms: durationMs,
      size_bytes: mp3.length,
    }),
  );

  console.log(`loaded ${meta.title}: ${segments.length} segments, ${chapters.length} chapters, ${actions.length} action items`);
}
