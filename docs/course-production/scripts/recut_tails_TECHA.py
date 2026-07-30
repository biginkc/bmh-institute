"""OBSOLETE as of v5 (2026-07-10): the tail system was removed — clips now LOOP for their
full beat or hold their own last frame via <Freeze> (Jarrad permanent rule). Kept for history.
"""
#!/usr/bin/env python3
"""Cut TECH-A anim tails as CLEAN PLATES: `remotion still` of the clip's last displayed
frame with overlays disabled (cleanPlates inputProp skips labels/logos/circle).
Why not raw-clip extraction: Remotion's decode shifts the Seedance baked blue ~4/255
(PLAYBOOK 7.11) -> pops. Why not render-master extraction (GLO-A v6 method): TECH holds
are LONG (VOs outrun the 15s clips), so master frames carry baked labels that ghost under
the live queue, and b16's logo cutaway covers its own anim end. A still render uses the
SAME renderer decode path, minus the h264 roundtrip -> exact color match, no baked overlays.
Frame index = beat start (naive cumsum of durationInFrames) + animFrames - 2.
Usage: recut_tails_TECHA.py   (then render)."""
import json, subprocess

BASE = "/Users/jarradhenry/Sites/BMH apps/BMH Institute/docs/course-production/remotion"
PUB = f"{BASE}/public/lessonTECHA"
m = json.load(open(f"{PUB}/manifest.json"))
cursor = 0
for b in m["beats"]:
    if b.get("anim"):
        f = cursor + b["animFrames"] - 2
        out = f"{PUB}/tails/tail_{b['tag']}.png"
        subprocess.run(["npx","remotion","still","src/indexTECHA.ts","LessonTECHA",out,
                        f"--frame={f}",'--props={"cleanPlates":true}',"--log=error"],
                       cwd=BASE, check=True)
        print(f"{b['tag']}: still frame {f} -> {out}")
    cursor += b["durationInFrames"]
