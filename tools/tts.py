#!/usr/bin/env python3
"""逐句合成 → 拼接 → 精确时间轴。写回 lesson.json 的 audio 字段。"""
import json, subprocess, sys, wave, shutil, os
from pathlib import Path

VOICE_A = "ja-JP-NanamiNeural"   # 女：独白 / 对话 A
VOICE_B = "ja-JP-KeitaNeural"    # 男：对话 B
RATE_SLOW, RATE_NORM = "+15%", "+35%"
SR = 24000

def run(cmd):
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        sys.exit(f"FAILED: {' '.join(map(str,cmd))}\n{r.stderr.decode()[:500]}")

def synth(text, voice, rate, out_wav, tmp):
    """一句 → wav，返回采样数"""
    mp3 = tmp / (out_wav.stem + ".mp3")
    run([sys.executable,"-m","edge_tts","--voice",voice,"--rate",rate,
         "--text",text,"--write-media",str(mp3)])
    run(["ffmpeg","-v","quiet","-y","-i",str(mp3),"-ac","1","-ar",str(SR),str(out_wav)])
    with wave.open(str(out_wav)) as w:
        return w.getnframes()

def build(segments, out_mp3, tmp):
    """segments: [(text, voice, rate)] → 拼接成 mp3，返回 [[start,end],...] 秒"""
    frames, wavs = [], []
    for i,(text,voice,rate) in enumerate(segments):
        w = tmp / f"{out_mp3.stem}_{i:03d}.wav"
        frames.append(synth(text, voice, rate, w, tmp))
        wavs.append(w)
    listfile = tmp / f"{out_mp3.stem}.txt"
    listfile.write_text("".join(f"file '{w.resolve()}'\n" for w in wavs))
    run(["ffmpeg","-v","quiet","-y","-f","concat","-safe","0","-i",str(listfile),
         "-c:a","libmp3lame","-b:a","48k","-ac","1",str(out_mp3)])
    spans, acc = [], 0
    for n in frames:
        spans.append([round(acc/SR,3), round((acc+n)/SR,3)])
        acc += n
    return spans

def main(day_dir):
    d = Path(day_dir).resolve(); lf = d/"lesson.json"
    L = json.loads(lf.read_text(encoding="utf-8"))
    tmp = d/".tmp"; tmp.mkdir(exist_ok=True)

    mono = [s["ja"] for s in L["mono"]["sentences"]]
    turns = L["dialog"]["turns"]

    audio = {}
    audio["mono_slow"] = {"file":"mono_slow.mp3",
        "spans": build([(t,VOICE_A,RATE_SLOW) for t in mono], d/"mono_slow.mp3", tmp)}
    audio["mono"] = {"file":"mono.mp3",
        "spans": build([(t,VOICE_A,RATE_NORM) for t in mono], d/"mono.mp3", tmp)}
    audio["dialog"] = {"file":"dialog.mp3",
        "spans": build([(t["ja"], VOICE_A if t["sp"]=="A" else VOICE_B, RATE_NORM)
                        for t in turns], d/"dialog.mp3", tmp)}
    for k,v in audio.items():
        v["duration"] = v["spans"][-1][1]
    L["audio"] = audio
    lf.write_text(json.dumps(L, ensure_ascii=False, indent=2), encoding="utf-8")
    shutil.rmtree(tmp)
    for k,v in audio.items():
        print(f"  {k:11s} {v['duration']:6.1f}s  {len(v['spans'])}段  "
              f"{os.path.getsize(d/v['file'])//1024}KB")

if __name__ == "__main__":
    main(sys.argv[1])
