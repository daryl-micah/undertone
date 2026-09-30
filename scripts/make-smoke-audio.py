#!/usr/bin/env python3
"""Placeholder audio for the Phase 1 smoke meeting: one tone per speaker, timed to
the seeded transcript segments. Proves storage + playback; replaced by TTS in Phase 2."""
import math, struct, sys, wave

RATE = 16000
# (start_ms, end_ms, speaker) — mirrors supabase/seed.sql
SEGMENTS = [(0, 6000, 0), (6000, 12000, 1), (12000, 18000, 2),
            (18000, 24000, 0), (24000, 30000, 1), (30000, 36000, 0)]
PITCH = {0: 220.0, 1: 330.0, 2: 262.0}

out = sys.argv[1] if len(sys.argv) > 1 else "media/capture-smoke-test.wav"
frames = bytearray()
for start, end, spk in SEGMENTS:
    n = (end - start) * RATE // 1000
    for i in range(n):
        t = i / RATE
        # syllable-like amplitude pulses so it reads as "speech" in the waveform
        env = min(1.0, i / 800, (n - i) / 800) * (0.55 + 0.45 * math.sin(2 * math.pi * 3.2 * t))
        gap = 0.0 if (n - i) < RATE * 0.35 else 1.0
        s = env * gap * 0.25 * math.sin(2 * math.pi * PITCH[spk] * t)
        frames += struct.pack("<h", int(s * 32767))
with wave.open(out, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(bytes(frames))
print(out, len(frames), "bytes")
