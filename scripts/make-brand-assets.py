"""EVENGIRL marka varlıkları → public/

NEDEN BETİK, ELLE KOYULMUŞ DOSYA DEĞİL
Bu dosyalar devir zip'inden düşmüştü ve kod onlara başvurduğu için
`npm test` kırmızıydı. Elle bir kez koymak aynı şeyin bir daha yaşanmasını
engellemez; üreteç, kaybolduklarında tek komutla geri getirir.

Palet `src/lib/og/site.json`'daki `color` alanından okunur — marka rengi tek
yerde durur, ikonla enjekte edilen `theme-color` ayrışamaz.

ÜRETİLMEYENLER: `public/media/` altındaki fotoğraflar. Onlar gerçek görsel
içerik; uydurmak (özellikle insan portresi) yanlış olur. Yer tutucuları
`make-media-placeholders.py` açıkça "PLACEHOLDER" damgasıyla üretir.
"""

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SITE = json.loads((ROOT / "src/lib/og/site.json").read_text(encoding="utf-8"))

PINK = tuple(int(SITE["color"][i : i + 2], 16) for i in (0, 2, 4))  # FF4FA3
CREAM = (247, 240, 236)
DEEP = (74, 32, 51)
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_B, size)


def centered(draw: ImageDraw.ImageDraw, box, text, f, fill):
    left, top, right, bottom = draw.textbbox((0, 0), text, font=f)
    x = box[0] + (box[2] - box[0] - (right - left)) / 2 - left
    y = box[1] + (box[3] - box[1] - (bottom - top)) / 2 - top
    draw.text((x, y), text, font=f, fill=fill)


def crystal(size: int) -> Image.Image:
    """Kristal işaret: EVENGIRL'in `crystal-mark` bileşeninin sade karşılığı."""
    img = Image.new("RGB", (size, size), CREAM)
    d = ImageDraw.Draw(img)
    cx = cy = size / 2
    r = size * 0.34
    # Altı köşeli kristal gövdesi
    pts = [
        (cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)))
        for a in range(-90, 270, 60)
    ]
    d.polygon(pts, fill=PINK)
    # Üst faseti açan açık üçgen — düz pembe lekeyi kristal yapan tek detay
    d.polygon([pts[0], pts[1], (cx, cy)], fill=(255, 138, 197))
    d.polygon([pts[5], pts[0], (cx, cy)], fill=(255, 190, 222))
    return img


def write_icon(path: Path, size: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    crystal(size).save(path, "PNG", optimize=True)
    print(f"  {path.relative_to(ROOT)}  {size}×{size}")


def write_card(path: Path, w: int, h: int, title: str, sub: str) -> None:
    """Paylaşım kartı: düz zemin + kristal + iki satır yazı."""
    img = Image.new("RGB", (w, h), CREAM)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w, int(h * 0.06)], fill=PINK)
    mark = crystal(int(h * 0.42)).resize((int(h * 0.42), int(h * 0.42)))
    img.paste(mark, (int(w * 0.08), int((h - h * 0.42) / 2)))
    tx = int(w * 0.08) + int(h * 0.42) + int(w * 0.05)
    d.text((tx, int(h * 0.34)), title, font=font(int(h * 0.16)), fill=DEEP)
    d.text((tx, int(h * 0.56)), sub, font=font(int(h * 0.07)), fill=(150, 96, 122))
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "JPEG", quality=88, optimize=True)
    print(f"  {path.relative_to(ROOT)}  {w}×{h}")


pub = ROOT / "public"
print("[brand] ikonlar")
for size in (180, 192, 512):
    write_icon(pub / "__grok" / f"icon-{size}.png", size)
write_icon(pub / "favicon.png", 64)

print("[brand] paylaşım kartları")
write_card(pub / "og.jpg", 1200, 630, "EVENGIRL", SITE["description"])
# X akış kartı 50:11 — README/brand-check bu oranı istiyor
write_card(pub / "x-banner.jpg", 1500, 330, "EVENGIRL", "armanalabs")

print("[brand] kurulum sayfası stili")
install = pub / "__grok" / "install"
install.mkdir(parents=True, exist_ok=True)
(install / "styles.css").write_text(
    f""":root {{
  --pink: #{SITE["color"]};
  --cream: #F7F0EC;
  --deep: #4A2033;
}}
* {{ box-sizing: border-box; }}
body {{
  margin: 0;
  padding: 24px;
  background: var(--cream);
  color: var(--deep);
  font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
}}
h1 {{ font-size: 22px; margin: 0 0 4px; }}
p {{ margin: 0 0 12px; color: #8A5A72; }}
ol {{ padding-left: 20px; }}
li {{ margin-bottom: 10px; }}
img {{ max-width: 100%; border-radius: 12px; }}
.mark {{ width: 72px; height: 72px; border-radius: 18px; }}
.cta {{
  display: inline-block;
  padding: 12px 20px;
  border-radius: 999px;
  background: var(--pink);
  color: #fff;
  font-weight: 700;
  text-decoration: none;
}}
@media (prefers-color-scheme: dark) {{
  body {{ background: #1A1014; color: #F7F0EC; }}
  p {{ color: #C9A5B6; }}
}}
""",
    encoding="utf-8",
)
print(f"  {(install / 'styles.css').relative_to(ROOT)}")
