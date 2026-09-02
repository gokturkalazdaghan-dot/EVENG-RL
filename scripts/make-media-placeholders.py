"""EVENGIRL demo görselleri → public/media/

DÜRÜSTLÜK NOTU — BUNLAR YER TUTUCU.
Devir zip'inde `public/` yoktu; kod on bir görsele başvuruyor ve yoklukları
ekranda 404 üretiyor. Burada üretilenler ORİJİNAL DEĞİL:

  · Zeminler (cafe, forest, loft, prism, street-night) soyut degrade
    dokulardır. `processSource(..., "backdrop")` yedeğinde gerçekten
    kullanılabilirler — bir şeyi yanlış temsil etmiyorlar.

  · Portreler ve kahin kareleri İNSAN FOTOĞRAFIDIR ve uydurulmadı.
    Yerlerine üstünde "PLACEHOLDER" yazan düz karolar konuyor. Sahte bir
    yüz üretmek iki yönden yanlış olurdu: CLAUDE.md kural 4 zaten tohum
    portrelerinin kullanıcının yüzü sanılmasını yasaklıyor, ve var olmayan
    birinin yüzünü üretip ürüne koymak ayrı bir sorun.

Gerçek görseller sizin asıl deponuzdadır; oradan kopyalanınca bu betiğin
ürettikleri üzerine yazılır.
"""

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "media"
SITE = json.loads((ROOT / "src/lib/og/site.json").read_text(encoding="utf-8"))
PINK = tuple(int(SITE["color"][i : i + 2], 16) for i in (0, 2, 4))
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# (dosya, üst renk, alt renk) — her sahne kendi ışığını taşır
BACKDROPS = {
    "cafe": ((122, 88, 66), (232, 205, 176)),
    "forest": ((28, 62, 46), (150, 188, 150)),
    "loft": ((88, 84, 96), (226, 219, 212)),
    "prism": ((90, 40, 120), (255, 170, 210)),
    "street-night": ((14, 16, 34), (92, 58, 110)),
}

PLACEHOLDERS = {
    "portrait-arda": "PORTRE",
    "portrait-elif": "PORTRE",
    "portrait-zeynep": "PORTRE",
    "seer/coffee": "KAHİN · FİNCAN",
    "seer/palm": "KAHİN · EL",
    "seer/dream": "KAHİN · RÜYA",
}

W, H = 1024, 1024


def gradient(top, bottom, w=W, h=H) -> Image.Image:
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / (h - 1)
        d.line([(0, y), (w, y)], fill=tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return img


def write_backdrop(name: str, top, bottom) -> None:
    img = gradient(top, bottom)
    d = ImageDraw.Draw(img, "RGBA")
    # Yumuşak ışık lekeleri — düz degradeyi zemin gibi gösteren tek şey
    for i in range(7):
        a = i * 0.9
        cx = W * (0.15 + 0.13 * i)
        cy = H * (0.2 + 0.35 * math.sin(a))
        r = W * (0.10 + 0.05 * ((i % 3) + 1))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 22))
    img = img.filter(ImageFilter.GaussianBlur(18))
    path = OUT / f"{name}.jpg"
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "JPEG", quality=86, optimize=True)
    print(f"  zemin        {path.relative_to(ROOT)}")


def write_placeholder(name: str, label: str) -> None:
    img = Image.new("RGB", (W, H), (243, 232, 238))
    d = ImageDraw.Draw(img)
    # Çapraz tarama: bir bakışta "bu gerçek fotoğraf değil" desin
    for x in range(-H, W, 56):
        d.line([(x, 0), (x + H, H)], fill=(232, 210, 224), width=18)
    d.rectangle([40, 40, W - 40, H - 40], outline=PINK, width=6)
    big = ImageFont.truetype(FONT_B, 78)
    small = ImageFont.truetype(FONT_B, 40)
    for text, f, y, fill in (
        ("PLACEHOLDER", big, H * 0.40, PINK),
        (label, small, H * 0.53, (120, 74, 98)),
        ("gerçek görsel asıl depodan gelir", ImageFont.truetype(FONT_B, 27), H * 0.61, (162, 120, 142)),
    ):
        l, t, r, b = d.textbbox((0, 0), text, font=f)
        d.text(((W - (r - l)) / 2 - l, y), text, font=f, fill=fill)
    path = OUT / f"{name}.jpg"
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "JPEG", quality=88, optimize=True)
    print(f"  YER TUTUCU   {path.relative_to(ROOT)}")


OUT.mkdir(parents=True, exist_ok=True)
print("[media] zeminler — kullanılabilir soyut dokular")
for name, (top, bottom) in BACKDROPS.items():
    write_backdrop(name, top, bottom)

print("[media] portre ve kahin — AÇIKÇA yer tutucu, uydurma yüz yok")
for name, label in PLACEHOLDERS.items():
    write_placeholder(name, label)

# favicon.svg — __root.tsx bunu istiyor; kristal işaretin vektör hali
fav = ROOT / "public" / "favicon.svg"
hexpts = " ".join(
    f"{32 + 26 * math.cos(math.radians(a)):.1f},{32 + 26 * math.sin(math.radians(a)):.1f}"
    for a in range(-90, 270, 60)
)
fav.write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
    f'<rect width="64" height="64" rx="14" fill="#F7F0EC"/>'
    f'<polygon points="{hexpts}" fill="#{SITE["color"]}"/>'
    f'<polygon points="32,6 54.5,19 32,32" fill="#FFBEDE"/>'
    f"</svg>\n",
    encoding="utf-8",
)
print(f"[icon] {fav.relative_to(ROOT)}")
