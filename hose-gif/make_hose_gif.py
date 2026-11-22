"""Generate a looping cartoon GIF: an office worker losing a fight with a fire hose.

Run:  python3 make_hose_gif.py   ->  writes hose.gif next to this script.
Needs Pillow.
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFont

W, H = 480, 360          # output size
S = 2                    # supersampling factor
N = 48                   # frames per loop
FRAME_MS = 55
GROUND = 300
FONT_PATH = "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf"
CAPTION = "ME HANDLING MONDAY'S INBOX"

TAU = math.tau


def lerp(a, b, u):
    return a + (b - a) * u


# ----------------------------------------------------------------------------
# Motion: everything is a periodic function of t in [0, 1) so the GIF loops.
# ----------------------------------------------------------------------------
def hose_angle(t):
    """Direction of the water jet in radians (0 = right, +pi/2 = straight up)."""
    return (0.35
            + 0.95 * math.sin(TAU * t)
            + 0.45 * math.sin(2 * TAU * t + 1.3)
            + 0.25 * math.sin(5 * TAU * t + 0.4))


def pose(t):
    th = hose_angle(t)
    d = (math.cos(th), -math.sin(th))          # screen-space jet direction
    # Thrust pushes opposite to the jet: jet down -> lifted up, jet right -> shoved left.
    lift = max(0.0, -math.sin(th)) ** 1.5 * 46
    px = 235 - 38 * math.cos(th) + 14 * math.sin(3 * TAU * t)
    lean = -0.38 * math.cos(th) + 0.12 * math.sin(4 * TAU * t + 0.7)
    return th, d, lift, px, lean


def skeleton(t):
    th, d, lift, px, lean = pose(t)
    leg = 54
    hip = (px, GROUND - leg - lift)
    torso = 56
    sh = (hip[0] + torso * math.sin(lean), hip[1] - torso * math.cos(lean))
    head = (sh[0] + 26 * math.sin(lean), sh[1] - 26 * math.cos(lean))
    # Hands grip the hose in front of the chest, pulled along by the jet.
    front = (sh[0] + 30 * d[0] + 4, sh[1] + 18 + 22 * d[1])
    rear = (front[0] - 20 * d[0], front[1] - 20 * d[1])
    tip = (front[0] + 34 * d[0], front[1] + 34 * d[1])
    return dict(th=th, d=d, lift=lift, hip=hip, sh=sh, head=head,
                front=front, rear=rear, tip=tip, lean=lean)


# ----------------------------------------------------------------------------
# Water simulation (deterministic per frame index, pre-warmed for a clean loop)
# ----------------------------------------------------------------------------
GRAV = 0.85
SPEED = 21


class Drop:
    __slots__ = ("x", "y", "vx", "vy", "kind", "born", "k", "rot", "vr", "life")

    def __init__(self, x, y, vx, vy, kind, born, k, life):
        self.x, self.y, self.vx, self.vy = x, y, vx, vy
        self.kind, self.born, self.k, self.life = kind, born, k, life
        self.rot = 0.0
        self.vr = 0.0


def simulate():
    drops = []
    frames = []
    for f in range(3 * N):
        fi = f % N
        t = fi / N
        sk = skeleton(t)
        tx, ty = sk["tip"]
        th = sk["th"]
        rng = random.Random(fi * 7919 + 13)
        # main jet particle (k=0) plus spray
        for k in range(10):
            jit = 0 if k == 0 else rng.uniform(-0.16, 0.16)
            sp = SPEED * (1 if k == 0 else rng.uniform(0.75, 1.05))
            a = th + jit
            drops.append(Drop(tx, ty, sp * math.cos(a), -sp * math.sin(a),
                              "jet" if k == 0 else "spray", f, k, 40))
        if fi % 6 == 0:  # the occasional email shoots out with the water
            a = th + rng.uniform(-0.12, 0.12)
            e = Drop(tx, ty, 17 * math.cos(a), -17 * math.sin(a), "mail", f, 99, 40)
            e.rot = rng.uniform(0, 360)
            e.vr = rng.uniform(-25, 25)
            drops.append(e)

        alive = []
        for p in drops:
            p.x += p.vx
            p.y += p.vy
            p.vy += GRAV if p.kind != "mail" else GRAV * 0.6
            p.rot += p.vr
            p.life -= 1
            if p.kind != "mail" and p.y >= GROUND - 2 and p.kind != "splash":
                # hit the ground: make a little splash
                srng = random.Random((p.born % N) * 131 + p.k)
                for j in range(2 if p.kind == "jet" else 1):
                    s = Drop(p.x, GROUND - 3, srng.uniform(-4, 4) + p.vx * 0.25,
                             -srng.uniform(3, 8), "splash", p.born, p.k * 10 + j, 12)
                    alive.append(s)
                continue
            if p.kind == "splash" and p.y > GROUND + 2:
                continue
            if p.kind == "mail" and p.y > GROUND - 6:
                p.y = GROUND - 6
                p.vx *= 0.6
                p.vy = 0
                p.vr = 0
            if p.life <= 0 or p.x < -40 or p.x > W + 40 or p.y < -200:
                continue
            alive.append(p)
        drops = alive
        if f >= 2 * N:
            frames.append([(p.x, p.y, p.kind, p.born, p.k, p.rot) for p in drops])
    return frames


# ----------------------------------------------------------------------------
# Drawing helpers (all coordinates in 1x space, scaled by S)
# ----------------------------------------------------------------------------
def sc(pt):
    return (pt[0] * S, pt[1] * S)


def line(dr, pts, fill, width):
    dr.line([sc(p) for p in pts], fill=fill, width=int(width * S), joint="curve")
    r = width * S / 2
    for p in (pts[0], pts[-1]):
        x, y = sc(p)
        dr.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def circle(dr, c, r, fill, outline=None, width=0):
    x, y = sc(c)
    rr = r * S
    dr.ellipse([x - rr, y - rr, x + rr, y + rr], fill=fill,
               outline=outline, width=int(width * S))


def bezier(p0, p1, p2, p3, n=40):
    out = []
    for i in range(n + 1):
        u = i / n
        a = (1 - u) ** 3
        b = 3 * (1 - u) ** 2 * u
        c = 3 * (1 - u) * u ** 2
        d = u ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
                    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


OUTLINE = (40, 34, 48)
SKIN = (246, 200, 160)
SHIRT = (236, 242, 250)
PANTS = (58, 66, 92)
TIE = (214, 52, 64)
HOSE = (205, 46, 46)
HOSE_DARK = (130, 22, 30)
BRASS = (222, 170, 60)
WATER = (120, 196, 255)
WATER_HI = (215, 240, 255)


def draw_background(img):
    dr = ImageDraw.Draw(img)
    for y in range(GROUND * S):
        u = y / (GROUND * S)
        col = (int(lerp(150, 214, u)), int(lerp(204, 236, u)), int(lerp(250, 255, u)))
        dr.line([(0, y), (W * S, y)], fill=col)
    # sun
    circle(dr, (410, 62), 26, (255, 224, 110))
    # clouds
    for cx, cy in ((90, 70), (300, 46)):
        for ox, oy, r in ((0, 0, 18), (20, -8, 22), (42, 0, 17), (20, 6, 16)):
            circle(dr, (cx + ox, cy + oy), r, (255, 255, 255))
    # office building in the distance
    dr.rectangle([sc((300, 150)), sc((470, GROUND))], fill=(176, 190, 214))
    for gx in range(312, 462, 26):
        for gy in range(164, GROUND - 20, 30):
            dr.rectangle([sc((gx, gy)), sc((gx + 16, gy + 18))], fill=(222, 236, 250))
    # grass
    dr.rectangle([sc((0, GROUND)), sc((W, H))], fill=(122, 196, 98))
    dr.rectangle([sc((0, GROUND)), sc((W, GROUND + 5))], fill=(98, 170, 80))
    # hydrant
    hx = 40
    dr.rounded_rectangle([sc((hx - 13, GROUND - 46)), sc((hx + 13, GROUND))],
                         radius=6 * S, fill=HOSE, outline=OUTLINE, width=2 * S)
    dr.pieslice([sc((hx - 15, GROUND - 60)), sc((hx + 15, GROUND - 32))], 180, 360,
                fill=HOSE, outline=OUTLINE, width=2 * S)
    dr.rectangle([sc((hx - 19, GROUND - 6)), sc((hx + 19, GROUND))],
                 fill=HOSE_DARK, outline=OUTLINE, width=2 * S)
    circle(dr, (hx + 15, GROUND - 30), 6, BRASS, OUTLINE, 2)


def draw_hose(dr, sk, t):
    start = (55, GROUND - 30)
    d = sk["d"]
    rear = sk["rear"]
    wig = 30 * math.sin(2 * TAU * t + 0.8)
    c1 = (120 + wig, GROUND + 4)
    c2 = (rear[0] - 70 * d[0] - 20, rear[1] - 70 * d[1] + 40 + wig * 0.6)
    pts = bezier(start, c1, c2, rear)
    line(dr, pts, OUTLINE, 13)
    line(dr, pts, HOSE, 9)
    line(dr, [(x, y - 2) for x, y in pts], (236, 96, 96), 2)


def draw_nozzle(dr, sk):
    line(dr, [sk["rear"], sk["tip"]], OUTLINE, 13)
    line(dr, [sk["rear"], sk["front"]], HOSE, 9)
    line(dr, [sk["front"], sk["tip"]], BRASS, 9)
    circle(dr, sk["tip"], 6, BRASS, OUTLINE, 2)


def limb(dr, a, b, length, bend, col, width):
    """Two-segment limb from a to b with a knee/elbow."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    dist = max(1e-3, math.hypot(dx, dy))
    half = length / 2
    off = math.sqrt(max(0.0, half * half - (dist / 2) ** 2)) * bend
    mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    nx, ny = -dy / dist, dx / dist
    knee = (mx + nx * off, my + ny * off)
    line(dr, [a, knee, b], OUTLINE, width + 4)
    line(dr, [a, knee, b], col, width)
    return knee


def draw_person(dr, sk, t, back_layer):
    hip, sh, head = sk["hip"], sk["sh"], sk["head"]
    lift = sk["lift"]
    lean = sk["lean"]
    if back_layer:
        # legs
        if lift < 6:
            feet = [(hip[0] - 18 + 6 * math.sin(TAU * t * 4), GROUND - 4),
                    (hip[0] + 20, GROUND - 4)]
        else:
            k = min(1.0, lift / 30)
            sw = math.sin(TAU * t * 8)
            feet = [(hip[0] - 10 - 26 * k * sw, hip[1] + 50 - 8 * k),
                    (hip[0] + 10 + 26 * k * sw, hip[1] + 50 - 14 * k * abs(sw))]
        for i, ft in enumerate(feet):
            limb(dr, hip, ft, 56, 1 if i else -1, PANTS, 11)
            x, y = sc(ft)
            dr.ellipse([x - 11 * S, y - 5 * S, x + 13 * S, y + 6 * S],
                       fill=(30, 30, 36))
        # rear arm (behind body)
        limb(dr, sh, sk["rear"], 50, 1, SHIRT, 9)
        circle(dr, sk["rear"], 6, SKIN, OUTLINE, 2)
        return

    # torso
    line(dr, [hip, sh], OUTLINE, 30)
    line(dr, [hip, sh], SHIRT, 26)
    # belt
    bx, by = hip[0] + 4 * math.sin(lean), hip[1] - 4 * math.cos(lean)
    line(dr, [(bx - 12, by), (bx + 12, by)], (60, 46, 40), 4)
    # tie flapping in the spray
    flap = 0.9 + 0.5 * math.sin(TAU * t * 6) + 0.4 * math.cos(sk["th"])
    neck = (sh[0] + 2, sh[1] + 2)
    tl = 30
    tip = (neck[0] - tl * math.sin(flap - 0.3 + lean), neck[1] + tl * math.cos(flap - 0.3 + lean) * 0.4 + 6)
    side = 5
    ang = math.atan2(tip[1] - neck[1], tip[0] - neck[0])
    px, py = -math.sin(ang) * side, math.cos(ang) * side
    poly = [neck, (neck[0] + px, neck[1] + py), tip, (neck[0] - px, neck[1] - py)]
    dr.polygon([sc(p) for p in poly], fill=TIE, outline=OUTLINE, width=2 * S)
    # head
    circle(dr, head, 19, SKIN, OUTLINE, 2.5)
    # hair spikes blown about
    for i in range(5):
        a = -lean - 1.2 + i * 0.5 + 0.15 * math.sin(TAU * t * 6 + i)
        base = (head[0] + 15 * math.cos(a - math.pi / 2), head[1] + 15 * math.sin(a - math.pi / 2))
        tipp = (head[0] + 28 * math.cos(a - math.pi / 2 - 0.35), head[1] + 28 * math.sin(a - math.pi / 2 - 0.35))
        line(dr, [base, tipp], (92, 60, 40), 5)
    # eyes, looking at the nozzle
    tx, ty = sk["tip"]
    for ex in (-1, 9):
        e = (head[0] + ex, head[1] - 4)
        circle(dr, e, 6.5, (255, 255, 255), OUTLINE, 1.5)
        vx, vy = tx - e[0], ty - e[1]
        m = max(1e-3, math.hypot(vx, vy))
        circle(dr, (e[0] + 2.6 * vx / m, e[1] + 2.6 * vy / m), 2.4, OUTLINE)
    # eyebrows way up
    for ex in (-1, 9):
        line(dr, [(head[0] + ex - 5, head[1] - 15), (head[0] + ex + 5, head[1] - 17)], OUTLINE, 2)
    # yelling mouth
    mo = 4 + 3 * abs(math.sin(TAU * t * 5))
    mc = sc((head[0] + 5, head[1] + 9))
    dr.ellipse([mc[0] - 5 * S, mc[1] - mo * S, mc[0] + 5 * S, mc[1] + mo * S],
               fill=(120, 30, 40), outline=OUTLINE, width=2 * S)
    # sweat drops
    for i, (ox, oy) in enumerate(((-24, -10), (22, -18))):
        bob = 3 * math.sin(TAU * t * 6 + i * 2)
        c = (head[0] + ox, head[1] + oy + bob)
        dr.polygon([sc((c[0], c[1] - 7)), sc((c[0] - 4, c[1])), sc((c[0] + 4, c[1]))],
                   fill=WATER_HI)
        circle(dr, c, 4, WATER_HI)
    # front arm
    limb(dr, sh, sk["front"], 50, -1, SHIRT, 9)
    circle(dr, sk["front"], 6, SKIN, OUTLINE, 2)


def draw_water(dr, frame_drops, layer):
    if layer == "spray":
        for x, y, kind, born, k, rot in frame_drops:
            if kind == "spray":
                circle(dr, (x, y), 3.4, WATER)
            elif kind == "splash":
                circle(dr, (x, y), 2.0, WATER_HI)
        return
    if layer == "jet":
        jet = sorted([(born, x, y) for x, y, kind, born, k, rot in frame_drops if kind == "jet"])
        segs = []
        for (b0, x0, y0), (b1, x1, y1) in zip(jet, jet[1:]):
            if b1 - b0 == 1 and math.hypot(x1 - x0, y1 - y0) < 80:
                segs.append(((x0, y0), (x1, y1)))
        for a, b in segs:
            line(dr, [a, b], WATER, 13)
        for a, b in segs:
            line(dr, [a, b], WATER_HI, 4)
        return
    if layer == "mail":
        for x, y, kind, born, k, rot in frame_drops:
            if kind != "mail":
                continue
            w, h = 15, 10
            r = math.radians(rot)
            cr, sr = math.cos(r), math.sin(r)

            def rp(px, py):
                return sc((x + px * cr - py * sr, y + px * sr + py * cr))

            corners = [rp(-w / 2, -h / 2), rp(w / 2, -h / 2), rp(w / 2, h / 2), rp(-w / 2, h / 2)]
            dr.polygon(corners, fill=(255, 255, 255), outline=OUTLINE, width=int(1.5 * S))
            dr.line([corners[0], rp(0, 1), corners[1]], fill=OUTLINE, width=int(1.5 * S))


def draw_caption(img):
    dr = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT_PATH, 26 * S)
    bbox = dr.textbbox((0, 0), CAPTION, font=font, stroke_width=3 * S)
    tw = bbox[2] - bbox[0]
    dr.text(((W * S - tw) / 2, 10 * S), CAPTION, font=font, fill=(255, 255, 255),
            stroke_width=3 * S, stroke_fill=(20, 20, 28))


def main():
    sim = simulate()
    bg = Image.new("RGB", (W * S, H * S))
    draw_background(bg)
    frames = []
    for i in range(N):
        t = i / N
        sk = skeleton(t)
        img = bg.copy()
        dr = ImageDraw.Draw(img)
        # puddle grows/shrinks a little
        pw = 70 + 8 * math.sin(TAU * t)
        dr.ellipse([sc((330 - pw, GROUND + 8)), sc((330 + pw, GROUND + 22))], fill=(140, 200, 235))
        draw_hose(dr, sk, t)
        draw_person(dr, sk, t, back_layer=True)
        draw_person(dr, sk, t, back_layer=False)
        draw_nozzle(dr, sk)
        draw_water(dr, sim[i], "jet")
        draw_water(dr, sim[i], "spray")
        draw_water(dr, sim[i], "mail")
        draw_caption(img)
        frames.append(img.resize((W, H), Image.LANCZOS))

    # shared palette keeps colours stable between frames
    palette_src = frames[0].quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    pal = [f.quantize(palette=palette_src, dither=Image.Dither.NONE) for f in frames]
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hose.gif")
    pal[0].save(out, save_all=True, append_images=pal[1:], duration=FRAME_MS,
                loop=0, optimize=True, disposal=1)
    print("wrote", out, os.path.getsize(out) // 1024, "KB")


if __name__ == "__main__":
    main()
