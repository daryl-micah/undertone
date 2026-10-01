// Sarvam AI calls shared by the seed pipeline and the upload path.

const API = "https://api.sarvam.ai";

// Sarvam's batch STT misreads undeclared uploads (an MP3 came back as "audio/wav"
// with an empty transcript), so always declare the codec and content type.
const CODECS = { mp3: "mp3", wav: "wav", m4a: "x-m4a", mp4: "mp4", webm: "webm", ogg: "ogg", aac: "aac", flac: "flac" };
export function codecFor(fileName) {
  return CODECS[fileName.split(".").pop()?.toLowerCase() ?? ""];
}
export const STT_MODEL = "saaras:v3";

function headers(apiKey, json = true) {
  if (!apiKey) throw new Error("SARVAM_API_KEY is not set");
  return { "api-subscription-key": apiKey, ...(json ? { "content-type": "application/json" } : {}) };
}

async function call(path, apiKey, init = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}${path}`, { ...init, headers: { ...headers(apiKey, Boolean(init.body)), ...init.headers } });
    if (res.ok) return res.json();
    const body = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    throw new Error(`Sarvam ${path} ${res.status}: ${body.slice(0, 400)}`);
  }
}

/**
 * Text to speech with bulbul:v3. Returns a WAV buffer.
 * @param {{ text: string, voice: string, languageCode: string, pace?: number, sampleRate: number, apiKey?: string }} o
 */
export async function textToSpeech({ text, voice, languageCode, pace = 1.0, sampleRate, apiKey = process.env.SARVAM_API_KEY }) {
  const body = await call("/text-to-speech", apiKey, {
    method: "POST",
    body: JSON.stringify({
      text,
      language_code: languageCode,
      model: "bulbul:v3",
      speaker: voice,
      pace,
      speech_sample_rate: sampleRate,
      output_audio_codec: "wav",
    }),
  });
  return Buffer.from(body.audios.join(""), "base64");
}

/**
 * Batch speech to text with diarization (the REST endpoint is limited to 30 s and
 * has no diarization). codemix mode keeps Hindi in Devanagari and English in Latin.
 * @param {{ audio: Buffer | Uint8Array, fileName: string, codec?: string, mime?: string, numSpeakers?: number, apiKey?: string, progress?: (msg: string) => void, timeoutMs?: number }} o
 * @returns {Promise<object>} Sarvam's raw output JSON; read speakers with diarizedEntries().
 */
export async function transcribeCodemix({
  audio,
  fileName,
  codec,
  mime,
  numSpeakers,
  apiKey = process.env.SARVAM_API_KEY,
  progress = () => {},
  // Below Vercel's 300 s function limit, so callers can still mark the meeting failed.
  timeoutMs = 240_000,
}) {
  progress("Sending audio for transcription");
  const job = await call("/speech-to-text/job/v1", apiKey, {
    method: "POST",
    body: JSON.stringify({
      job_parameters: {
        model: STT_MODEL,
        mode: "codemix",
        language_code: "unknown",
        with_timestamps: true,
        with_diarization: true,
        ...(numSpeakers ? { num_speakers: numSpeakers } : {}),
        ...(codec ? { input_audio_codec: codec } : {}),
      },
    }),
  });

  const upload = await call("/speech-to-text/job/v1/upload-files", apiKey, {
    method: "POST",
    body: JSON.stringify({ job_id: job.job_id, files: [fileName] }),
  });
  const target = upload.upload_urls[fileName]?.file_url;
  if (!target) throw new Error("Sarvam returned no upload URL");
  const put = await fetch(target, {
    method: "PUT",
    headers: {
      ...(upload.storage_container_type?.startsWith("Azure") ? { "x-ms-blob-type": "BlockBlob" } : {}),
      ...(mime ? { "content-type": mime, "x-ms-blob-content-type": mime } : {}),
    },
    body: audio,
  });
  if (!put.ok) throw new Error(`Uploading audio to Sarvam failed: ${put.status} ${(await put.text()).slice(0, 200)}`);

  await call(`/speech-to-text/job/v1/${job.job_id}/start`, apiKey, { method: "POST" });

  const started = Date.now();
  let status;
  for (;;) {
    status = await call(`/speech-to-text/job/v1/${job.job_id}/status`, apiKey);
    if (status.job_state === "Completed" || status.job_state === "Failed") break;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Transcription is taking too long (job ${job.job_id} still ${status.job_state})`);
    }
    progress(`Transcribing (${Math.round((Date.now() - started) / 1000)}s)`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  const detail = status.job_details?.[0];
  if (status.job_state === "Failed" || detail?.state !== "Success") {
    throw new Error(`Transcription failed: ${detail?.error_message || status.error_message || status.job_state}`);
  }

  const outName = detail.outputs?.[0]?.file_name;
  const download = await call("/speech-to-text/job/v1/download-files", apiKey, {
    method: "POST",
    body: JSON.stringify({ job_id: job.job_id, files: [outName] }),
  });
  const res = await fetch(download.download_urls[outName].file_url);
  if (!res.ok) throw new Error(`Downloading transcript failed: ${res.status}`);
  return res.json();
}

/**
 * Diarized entries from a batch STT result. Throws (showing the shape) when there
 * are none, rather than returning an empty transcript.
 * @returns {{ transcript: string, start_time_seconds: number, end_time_seconds: number, speaker_id: string }[]}
 */
export function diarizedEntries(raw) {
  const entries = raw?.diarized_transcript?.entries;
  if (Array.isArray(entries) && entries.length) return entries;
  throw new Error(
    `STT output has no diarized entries (keys: ${Object.keys(raw ?? {}).join(", ")}; ` +
      `diarized_transcript: ${JSON.stringify(raw?.diarized_transcript)?.slice(0, 200)})`,
  );
}
