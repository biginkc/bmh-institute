#!/usr/bin/env python3
"""Contact sheet of the 32 rendered Lesson 7B seller clips: mid-frame of each, labeled drill # + avatar.
Output: course-assets/heygen/lesson7B/_seller_clips_contactsheet.jpg  (8 rows x 4 cols)."""
import json, subprocess, os, pathlib
from PIL import Image, ImageDraw, ImageFont
import os

BMH_ROOT = os.environ.get("BMH_INSTITUTE_ROOT") or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
HG = pathlib.Path(f"{BMH_ROOT}/course-assets/heygen/lesson7B")
rows = json.load(open(HG/"_seller_map.json"))
TW, TH, COLS = 320, 180, 4
ROWS = (len(rows)+COLS-1)//COLS
PAD, LBL = 6, 22
sheet = Image.new("RGB", (COLS*(TW+PAD)+PAD, ROWS*(TH+LBL+PAD)+PAD), (20,20,24))
draw = ImageDraw.Draw(sheet)
try: font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 13)
except: font = ImageFont.load_default()
tmp = "/tmp/_sellerframe.png"
for i, r in enumerate(rows):
    f = HG/f"{r['tag']}.mp4"
    x = PAD + (i%COLS)*(TW+PAD); y = PAD + (i//COLS)*(TH+LBL+PAD)
    if f.exists():
        subprocess.run(["ffmpeg","-v","error","-ss","1.2","-i",str(f),"-vframes","1",tmp,"-y"],check=True)
        im = Image.open(tmp).convert("RGB").resize((TW,TH))
        sheet.paste(im,(x,y))
    else:
        draw.rectangle([x,y,x+TW,y+TH], fill=(60,30,30))
        draw.text((x+8,y+TH//2), "MISSING", fill=(255,120,120), font=font)
    label = f"{r['drill']:>2}  {r['avatar_name'][:26]}"
    draw.text((x+4, y+TH+4), label, fill=(230,230,235), font=font)
out = HG/"_seller_clips_contactsheet.jpg"
sheet.save(out, quality=88)
print("wrote", out, sheet.size)
