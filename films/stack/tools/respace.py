"""Respace a TTS take: each sentence keeps its own audio and moves to a planned start (the picture's beat).
Usage: python3 -I tools/respace.py  (reads tools/voice-kokoro-raw.*, writes assets/voice.wav + assets/voice.words.json)"""

import json
import re
import subprocess
from pathlib import Path

RAW_WAV, RAW_WORDS = "tools/voice-kokoro-raw.wav", "tools/voice-kokoro-raw.words.json"
# first word of each paragraph of script.txt, how many of its occurrences after the previous paragraph's start to skip,
# and its segment's new start (s). The voice starts 0.5 s in; ~0.9 s between paragraphs; two breaths, 2.0 s after the
# model server's failures (before "Then the eyes") and 1.8 s after the daily summary (before "Langfuse keeps the traces").
# Skips: paragraph 4's "The" follows the quoted "The room is unavailable"; paragraph 8's "Prometheus" follows
# paragraph 7's "metrics to Prometheus".
# 2026-11-12: re-voiced for paragraph 5's corrected line (fails closed at once; the alert after sixty seconds),
# 0.7 s longer, so paragraphs 6 to 13 start 0.7 s later.
# The raw take (2026-11-10, re-voiced) came with Kokoro splits ("p / or / ts", "gateway / s", ...); they were merged
# back into script.txt's words before this ran, so tools/voice-kokoro-raw.words.json has one entry per script word.
PLAN = [
    ("Fifteen", 0, 0.46),
    ("The", 0, 8.43),
    ("Behind", 0, 22.05),
    ("The", 1, 30.2),
    ("Gateway-state", 0, 44.47),
    ("The", 0, 57.14),
    ("Then", 0, 74.12),
    ("Prometheus", 1, 92.67),
    ("The", 0, 101.86),
    ("Langfuse", 0, 115.76),
    ("If", 0, 127.68),
    ("Every", 0, 137.55),
    ("Fifteen", 0, 153.57),
]
d = json.loads(Path(RAW_WORDS).read_text())
words = d["words"]
# find each paragraph's first word index, in order: the next occurrence after the previous paragraph's start, skipping nth
idx, k = [], 0
for w0, nth, _ in PLAN:
    skip = nth or 0
    for i in range(k, len(words)):
        if words[i]["word"] == w0:
            if skip == 0:
                idx.append(i)
                k = i + 1
                break
            skip -= 1
    else:
        raise SystemExit(f'no "{w0}" after word {k}')
idx.append(len(words))
segs = []
for j, (_, _, new) in enumerate(PLAN):
    a, b = idx[j], idx[j + 1]
    t0 = max(0.0, words[a]["start"] - 0.04)
    t1 = words[b - 1]["end"] + 0.15
    segs.append((t0, t1, new, a, b))
out = []
for t0, _t1, new, a, b in segs:
    for w in words[a:b]:
        out.append(
            {
                **w,
                "start": round(w["start"] - t0 + new, 3),
                "end": round(w["end"] - t0 + new, 3),
            }
        )
dur = round(segs[-1][2] + (segs[-1][1] - segs[-1][0]) + 0.3, 3)
parts, labels = [], []
for i, (t0, t1, new, _a, _b) in enumerate(segs):
    ms = round(new * 1000)
    parts.append(
        f"[0:a]atrim={t0:.3f}:{t1:.3f},asetpts=PTS-STARTPTS,adelay={ms}|{ms}[s{i}]"
    )
    labels.append(f"[s{i}]")
fc = (
    ";".join(parts)
    + ";"
    + "".join(labels)
    + f"amix=inputs={len(segs)}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=24000,apad,atrim=0:{dur}[o]"
)
subprocess.run(
    [
        "ffmpeg",
        "-v",
        "error",
        "-y",
        "-i",
        RAW_WAV,
        "-filter_complex",
        fc,
        "-map",
        "[o]",
        "assets/voice.wav",
    ],
    check=True,
)
d2 = {**d, "duration": dur, "words": out}
Path("assets/voice.words.json").write_text(json.dumps(d2, ensure_ascii=False))
print("duration", dur)
for s in segs:
    print(
        f"{s[2]:6.2f}  {words[s[3]]['word']} … {words[s[4] - 1]['word']}  ({s[1] - s[0]:.2f}s)"
    )

# captions from the script's own words, timed by the respaced word times; a long paragraph splits at its sentences
paras = [x.strip() for x in Path("script.txt").read_text().split("\n\n") if x.strip()]
assert len(paras) == len(segs), (len(paras), len(segs))


def ts(s):
    ms = round(s * 1000)
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


cues, k = [], 0
for (_t0, _t1, _new, a, b), para in zip(segs, paras, strict=True):
    ws = out[k : k + (b - a)]
    k += b - a
    parts = re.split(r'(?<=[.:?!])\s+(?=[A-Z"“])', para) if len(para) > 70 else [para]
    counts = [len(x.split()) for x in parts]
    scale = len(ws) / sum(counts)
    j = 0
    for x, c in zip(parts, counts, strict=True):
        n = max(1, round(c * scale))
        seg = ws[j : j + n] or ws[-1:]
        j += n
        cues.append((seg[0]["start"], seg[-1]["end"] + 0.25, x))
srt = "\n".join(
    f"{i + 1}\n{ts(a)} --> {ts(min(b, cues[i + 1][0] - 0.05) if i + 1 < len(cues) else b)}\n{x}\n"
    for i, (a, b, x) in enumerate(cues)
)
Path("captions.srt").write_text(srt)
print("captions captions.srt", len(cues), "cues")
