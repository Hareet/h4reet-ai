"""Respace a TTS take: each sentence keeps its own audio and moves to a planned start (the picture's beat).
Usage: python3 -I tools/respace.py  (reads tools/voice-kokoro-raw.*, writes assets/voice.wav + assets/voice.words.json)"""

import json
import re
import subprocess
from pathlib import Path

RAW_WAV, RAW_WORDS = "tools/voice-kokoro-raw.wav", "tools/voice-kokoro-raw.words.json"
# first word of each sentence → its new start (s)
# (nth counts from the previous paragraph's first word: ('The', 1, …) skips paragraph 6's "The latest run" to reach
# paragraph 7's "The latest product runs")
# 0.5 s lead, ~0.45 s between paragraphs; a breath of 1.4 s after the guards, before "Then the red team attacks".
# 2026-11-12: re-voiced for the corrected lines in paragraphs 6 and 8; paragraph 8 runs 1.0 s longer, so paragraphs 9 and
# 10 start 1.0 s later.
PLAN = [
    ("How", 0, 0.5),
    ("Every", 0, 6.44),
    ("Each", 0, 14.93),
    ("No", 0, 24.42),
    ("In", 0, 31.09),
    ("Then", 0, 44.31),
    ("The", 1, 59.75),
    ("Every", 0, 70.8),
    ("And", 0, 82.07),
    ("Tested", 0, 89.65),
]
d = json.loads(Path(RAW_WORDS).read_text())
words = d["words"]
# find each sentence's first word index, in order
idx, k = [], 0
for w0, nth, _ in PLAN:
    seen = -1
    for i in range(k, len(words)):
        if words[i]["word"] == w0:
            seen += 1
            if nth is None or seen >= nth:
                idx.append(i)
                k = i + 1
                break
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
