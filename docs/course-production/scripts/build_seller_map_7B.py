#!/usr/bin/env python3
import os
"""Build the durable Lesson 7B seller map: drill -> (avatar_id, voice_id, pushback line).
Reads:  course-assets/heygen/lesson7B/_seller_picks.json  (32 avatars, alternating M/F)
        docs/course-production/shotlists/lesson-7B-script-clean.txt  (32 SELLER: lines)
        HeyGen /v2/voices  (to assign a distinct, gender-matched voice per drill)
Writes: course-assets/heygen/lesson7B/_seller_map.json  (the single source of truth)
        docs/course-production/shotlists/module-07-lesson7B-avatar-map.md (human-readable)
Idempotent: never touches lesson7A / module-07 paths.
"""
import json, re, urllib.request, pathlib

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))

ROOT = pathlib.Path(BMH_ROOT)
HG   = ROOT/"course-assets/heygen/lesson7B"
DOCS = ROOT/"docs/course-production"
KEY  = pathlib.Path.home().joinpath(".config/bmh-course/heygen.key").read_text().strip()

picks = json.load(open(HG/"_seller_picks.json"))            # 32, in drill order
assert len(picks) == 32, f"expected 32 picks, got {len(picks)}"

# --- 32 seller pushback lines, in drill order, verbatim from the clean script ---
lines = []
for ln in open(DOCS/"shotlists/lesson-7B-script-clean.txt"):
    m = re.match(r"^SELLER:\s*(.+?)\s*$", ln)
    if m: lines.append(m.group(1))
assert len(lines) == 32, f"expected 32 seller lines, got {len(lines)}"

# --- HeyGen voices: distinct, gender-matched, natural US first-name voices ---
voices = json.load(urllib.request.urlopen(urllib.request.Request(
    "https://api.heygen.com/v2/voices", headers={"x-api-key": KEY}), timeout=120))["data"]["voices"]
def clean(n): return re.sub(r"\s+", " ", n).strip()

# preferred: ordinary adult US first names (skip novelty/emotional/celebrity-styled)
PREF_M = ["Daniel","Andrew","Brandon","Chase","Connor","Aaron","Calvin","Clint",
          "Bill","Barry","Bruce","Brooks","Bennett","Arthur","Allen","Dale"]
PREF_F = ["Abigail","Caroline","Carolyn","Catherine","Christina","Claire","Ashley",
          "April","Brianna","Bethany","Barbara","Ann","Alexa","Alexis","Allison","Aria"]

def bank(gender, pref):
    seen=set(); out=[]
    byname={}
    for v in voices:
        if v.get("language")!="English" or not v.get("support_locale") or v.get("emotion_support"): continue
        if v.get("gender")!=gender: continue
        byname.setdefault(clean(v["name"]), v["voice_id"])
    for name in pref:               # preferred names first, in order
        if name in byname and byname[name] not in seen:
            out.append((name, byname[name])); seen.add(byname[name])
    for name,vid in sorted(byname.items()):   # top up with any other plain names
        if re.fullmatch(r"[A-Z][a-z]{2,10}", name) and vid not in seen:
            out.append((name, vid)); seen.add(vid)
    return out

male_bank, female_bank = bank("male", PREF_M), bank("female", PREF_F)
mi = fi = 0
rows = []
for i, (p, text) in enumerate(zip(picks, lines), start=1):
    g = p["gender"]
    if g == "male":  vname, vid = male_bank[mi];  mi += 1
    else:            vname, vid = female_bank[fi]; fi += 1
    rows.append({
        "drill": i,
        "tag": f"d{i:02d}_seller",
        "avatar_id": p["avatar_id"],
        "avatar_name": p["name"],
        "gender": g,
        "voice_id": vid,
        "voice_name": vname,
        "text": text,
        "preview": p.get("preview"),
    })

json.dump(rows, open(HG/"_seller_map.json","w"), indent=1)

with open(DOCS/"shotlists/module-07-lesson7B-avatar-map.md","w") as f:
    f.write("# Lesson 7B — seller avatar + voice map (drill order)\n\n")
    f.write("Source of truth: `course-assets/heygen/lesson7B/_seller_map.json`. "
            "Avatars alternate M/F by drill; each seller gets a distinct gender-matched voice.\n\n")
    f.write("| # | Avatar | Gender | avatar_id | Voice | voice_id | Pushback |\n")
    f.write("|---|--------|--------|-----------|-------|----------|----------|\n")
    for r in rows:
        f.write(f"| {r['drill']} | {r['avatar_name']} | {r['gender'][0].upper()} | "
                f"`{r['avatar_id']}` | {r['voice_name']} | `{r['voice_id']}` | {r['text']} |\n")

print(f"wrote _seller_map.json ({len(rows)} rows) + avatar-map.md")
print(f"male voices used: {mi}  female voices used: {fi}")
print("drill 1:", rows[0]["avatar_name"], "/", rows[0]["voice_name"])
print("drill 2:", rows[1]["avatar_name"], "/", rows[1]["voice_name"])
