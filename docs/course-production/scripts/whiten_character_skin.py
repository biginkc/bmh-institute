#!/usr/bin/env python3
"""Whiten BMH doodle character skin to PURE WHITE — reference method + machine verification.

WHY THIS EXISTS (ISP v4->v5, 2026-07-11, Jarrad caught cream faces THREE times):
In this flat doodle art, character SKIN, SHIRTS, PANTS and cream CARDS are all the SAME
cream color, AND a face is the same pixel-size as a pair of pants (8-16k px). So you CANNOT
separate skin from clothing by color OR by size. Two brittle approaches that SHIP BUGS:
  - rectangular matte over the face  -> spills onto the same-cream shirt = a white BOX on the chest
  - size filter ("whiten small cream blobs") -> silently SKIPS large faces = cream face ships
  - zone-centroid fill -> whitens the cream CARD behind a face
The only thing that reliably separates skin from clothing is POSITION + the black doodle
OUTLINES: flood-fill from a point ON the face; the fill stops at the character's own outline
so it cannot touch a card behind them, and it fills the whole face regardless of size.

HARD RULE: character skin is ALWAYS pure white (~250,251,250), NEVER cream. Match Andrea's
white narrator face. And you may NOT declare a skin/color fix done by eyeballing or a debug
overlay — white(250,251,250) vs cream(253,245,222) is 3 values apart and not eyeball-
distinguishable. Machine-verify the OUTPUT (verify_output below) until 0 misses AND 0 bleed,
THEN read it, THEN gate. Point-sampling coords is unreliable (you hit outlines/features) —
use connected-component blob bboxes.

USAGE PATTERN (see ISP_SEEDS at bottom for a worked example):
  1. flood_skin(src, out, seeds)            # seeds = one (x,y) per face/hand
  2. loop: self_correct(out) until residual_cream() returns []   # re-seeds leftover cream faces
  3. box_fill(out, box) for the rare merged face==shirt case (no separating outline)
  4. restore_bleed(out, orig)               # undo any clothing that flooded white
  5. assert verify_output(out, orig) == (0, 0)   # misses, bleeds
"""
import sys, json
from collections import deque
from PIL import Image, ImageDraw

WHITE = (250, 251, 250)

def is_cream(c):
    r, g, b = c
    return r >= 234 and g >= 220 and 186 <= b <= 248 and 3 <= (r - b) <= 58 and abs(r - g) <= 18

def is_white(c):
    return c[0] >= 246 and c[1] >= 247 and c[2] >= 245

def _blobs(px, W, H, pred):
    vis = bytearray(W * H); out = []
    for s in range(W * H):
        if vis[s] or not pred(px[s]): vis[s] = 1; continue
        bl = []; dq = deque([s]); vis[s] = 1; mnx = mny = 1 << 30; mxx = mxy = -1
        while dq:
            i = dq.popleft(); bl.append(i); x = i % W; y = i // W
            mnx = min(mnx, x); mxx = max(mxx, x); mny = min(mny, y); mxy = max(mxy, y)
            for ni in (i - 1, i + 1, i - W, i + W):
                if 0 <= ni < W * H and not vis[ni] and abs(ni % W - x) <= 1 and pred(px[ni]):
                    vis[ni] = 1; dq.append(ni)
        out.append((len(bl), (mnx, mny, mxx, mxy)))
    return out

def flood_skin(im, seeds, th=32):
    """Flood-fill WHITE from each (x,y); nudges onto nearest cream if the seed misses."""
    px = im.load()
    for (x, y) in seeds:
        if not is_cream(px[x, y]):
            found = False
            for r in range(2, 28, 2):
                for dx in range(-r, r + 1, 3):
                    for dy in range(-r, r + 1, 3):
                        xx, yy = x + dx, y + dy
                        if 0 <= xx < im.width and 0 <= yy < im.height and is_cream(px[xx, yy]):
                            x, y = xx, yy; found = True; break
                    if found: break
                if found: break
        if is_cream(px[x, y]):
            ImageDraw.floodfill(im, (x, y), WHITE, thresh=th)

def residual_cream(im, scene_xranges=None, size=(700, 15000)):
    """Return bboxes of leftover cream that looks like face/hand (upper/compact, not scenery)."""
    W, H = im.size; px = list(im.getdata()); flags = []
    for a, (x0, y0, x1, y1) in _blobs(px, W, H, is_cream):
        cx = (x0 + x1) // 2; cy = (y0 + y1) // 2; w = x1 - x0; h = y1 - y0
        if scene_xranges and any(sx0 <= cx <= sx1 for sx0, sx1 in scene_xranges): continue
        if size[0] <= a <= size[1] and y1 <= 610 and cy <= 560 and w <= 235 and h <= 235:
            flags.append((a, (x0, y0, x1, y1)))
    return flags

def self_correct(im, scene_xranges=None, rounds=6):
    """Re-seed leftover cream face/hand blobs from their own centroids until none remain."""
    px = im.load()
    for _ in range(rounds):
        flags = residual_cream(im, scene_xranges)
        if not flags: break
        for a, (x0, y0, x1, y1) in flags:
            cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
            if not is_cream(px[cx, cy]):
                for yy in range(y0, y1, 3):
                    for xx in range(x0, x1, 3):
                        if is_cream(px[xx, yy]): cx, cy = xx, yy; break
                    else: continue
                    break
            if is_cream(px[cx, cy]): ImageDraw.floodfill(im, (cx, cy), WHITE, thresh=34)

def box_fill(im, box):
    """Merged face==shirt case only: whiten cream pixels inside a tight head box."""
    px = im.load(); x0, y0, x1, y1 = box
    for y in range(y0, y1):
        for x in range(x0, x1):
            if is_cream(px[x, y]): px[x, y] = WHITE

def restore_bleed(im, orig):
    """Undo clothing that flooded white: white-was-cream regions that are large AND low = pants/cloth."""
    W, H = im.size; op = list(im.getdata()); og = list(orig.getdata()); vis = bytearray(W * H)
    for s in range(W * H):
        if vis[s] or not (is_white(op[s]) and is_cream(og[s])): vis[s] = 1; continue
        bl = []; dq = deque([s]); vis[s] = 1; mny = 1 << 30; mxy = -1
        while dq:
            i = dq.popleft(); bl.append(i); x = i % W; y = i // W; mny = min(mny, y); mxy = max(mxy, y)
            for ni in (i - 1, i + 1, i - W, i + W):
                if 0 <= ni < W * H and not vis[ni] and abs(ni % W - x) <= 1 and is_white(op[ni]) and is_cream(og[ni]):
                    vis[ni] = 1; dq.append(ni)
        if len(bl) > 4000 and (mny + mxy) // 2 >= 470:
            for i in bl: op[i] = og[i]
    im.putdata(op)

def verify_output(im, orig, scene_xranges=None):
    """Machine gate. Returns (skin_misses, clothing_bleeds); BOTH must be 0 before you look/gate."""
    misses = len(residual_cream(im, scene_xranges))
    W, H = im.size; op = list(im.getdata()); og = list(orig.getdata()); vis = bytearray(W * H); bleeds = 0
    for s in range(W * H):
        if vis[s] or not (is_white(op[s]) and is_cream(og[s])): vis[s] = 1; continue
        bl = []; dq = deque([s]); vis[s] = 1; mny = 1 << 30; mxy = -1
        while dq:
            i = dq.popleft(); bl.append(i); x = i % W; y = i // W; mny = min(mny, y); mxy = max(mxy, y)
            for ni in (i - 1, i + 1, i - W, i + W):
                if 0 <= ni < W * H and not vis[ni] and abs(ni % W - x) <= 1 and is_white(op[ni]) and is_cream(og[ni]):
                    vis[ni] = 1; dq.append(ni)
        if len(bl) > 4000 and (mny + mxy) // 2 >= 470: bleeds += 1
    return misses, bleeds

# --- Worked ISP config (2026-07-11): one seed per face/hand; scenery x-ranges to ignore ---
ISP_SEEDS = {
 "b02": ([(300,200),(185,455),(360,150)], [(206,124,344,290),(342,123,397,207)], [(500,1500)]),
 "b06": ([(1000,240),(905,245),(1100,245),(880,525),(1120,525)], [], [(150,700),(1200,1500)]),
 "b11": ([(380,235),(560,430),(300,505),(985,240),(890,470),(1120,470)], [(553,382,625,451)], [(1120,1500)]),
 "b16": ([(315,490),(510,405)], [(408,178,528,322)], [(700,1500)]),  # merged face -> box
 # ... full set lives in the git history of this lesson's rebuild; method is the reusable part.
}

if __name__ == "__main__":
    # python whiten_character_skin.py '{"src":..., "out":..., "seeds":[[x,y],...], "boxes":[[..]], "scene":[[x0,x1]]}'
    c = json.loads(sys.argv[1])
    im = Image.open(c["src"]).convert("RGB"); orig = im.copy()
    flood_skin(im, c.get("seeds", []))
    self_correct(im, c.get("scene"))
    for b in c.get("boxes", []): box_fill(im, b)
    restore_bleed(im, orig)
    m, bl = verify_output(im, orig, c.get("scene"))
    im.save(c["out"])
    print(f"{c['out']}: skin_misses={m} clothing_bleeds={bl} ({'PASS' if m==0 and bl==0 else 'FAIL — do NOT gate'})")
