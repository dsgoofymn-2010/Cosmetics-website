"""
Asset prep for BEAUTE&NUTRIE rebuild.

Reads the three real photos in images/ and writes cleaned, optimised outputs:
  images/store-front-clean.jpg / .webp   GST number painted out, promos cropped away
  images/webp/store-front-clean.webp     WebP encode (primary on the site)
  images/webp/store-front.webp           (source-quality copy of the raw shot, unused)
  images/webp/vanity-mirror.webp
  images/webp/mens-section.webp
  images/lqip.json                       tiny blurred base64 placeholders, one per photo

Everything below EDIT SETTINGS is where the geometry lives. Tweak, re-run, open the
output images and verify visually before shipping. Python 3.11 + Pillow.
"""

from __future__ import annotations

import base64
import io
import json
import random
from pathlib import Path

from PIL import Image, ImageFilter, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "images"
OUT_WEBP = SRC / "webp"
OUT_WEBP.mkdir(exist_ok=True)

# ----------------------------------------------------------------------------- EDIT SETTINGS
# Normalised (0..1) coordinates, axis = fraction of full image width/height.

# GST "GST No : 36ABHCS9210P1ZR" printed on the red fascia, top right.
GST_BOX = {
    "x0": 0.706,
    "x1": 0.886,
    "y0": 0.272,
    "y1": 0.334,
}
# Fascia red sampled to the left of the GST box, same rows, to keep lighting bands honest.
SAMPLE_BAND = {"x0": 0.52, "x1": 0.70}

# Final crop for the cleaned storefront: keep fascia + glowing wordmark + one arch bay,
# drop the promo posters/standees far left + ad kiosk far right + empty mall floor.
CROP = {"x0": 0.190, "x1": 0.885, "y0": 0.198, "y1": 0.695}

JPEG_QUALITY = 88
WEBP_QUALITY = 80
LQIP_WIDTH = 24  # tiny placeholder width in px
# ----------------------------------------------------------- end of EDIT SETTINGS


def fill_row_median(draw: ImageDraw.ImageDraw, img: Image.Image, box: tuple[int, int, int, int]) -> None:
    """Paint the box row by row with the median fascia colour sampled in SAMPLE_BAND."""
    x0, y0, x1, y1 = box
    sx0, sx1 = int(SAMPLE_BAND["x0"] * img.width), int(SAMPLE_BAND["x1"] * img.width)
    rng = random.Random(7)
    px = img.load()
    for y in range(y0, y1):
        samples = [px[x, y] for x in range(sx0, sx1)]
        samples.sort(key=lambda c: c[0] + c[1] + c[2])
        mid = samples[len(samples) // 2]
        r, g, b = mid[:3]
        # keep the painted strip from looking like plastic: tiny per-pixel jitter
        for x in range(x0, x1):
            j = rng.randint(-3, 3)
            px[x, y] = (
                max(0, min(255, r + j)),
                max(0, min(255, g + j)),
                max(0, min(255, b + j)),
            )


def lqip(path: Path, width: int = LQIP_WIDTH) -> str:
    """Return a data URI of a heavily reduced, slightly blurred copy."""
    im = Image.open(path).convert("RGB")
    ratio = width / im.width
    small = im.resize((width, max(1, round(im.height * ratio))), Image.LANCZOS)
    small = small.filter(ImageFilter.GaussianBlur(1.2))
    buf = io.BytesIO()
    small.save(buf, format="JPEG", quality=30)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def main() -> None:
    src = Image.open(SRC / "store-front.jpg").convert("RGB")
    print("store-front.jpg", src.size)

    # 1) paint out the GST number, using original-image coordinates
    gx0 = int(GST_BOX["x0"] * src.width)
    gx1 = int(GST_BOX["x1"] * src.width)
    gy0 = int(GST_BOX["y0"] * src.height)
    gy1 = int(GST_BOX["y1"] * src.height)
    fill_row_median(ImageDraw.Draw(src), src, (gx0, gy0, gx1, gy1))

    # soften the repair seam so the patch melts into the fascia
    pad = 6
    patch_box = (max(0, gx0 - pad), max(0, gy0 - pad), min(src.width, gx1 + pad), min(src.height, gy1 + pad))
    patch = src.crop(patch_box).filter(ImageFilter.GaussianBlur(2.2))
    src.paste(patch, patch_box)

    # 2) crop away promos, kiosk, dead ceiling and empty floor
    cx0 = int(CROP["x0"] * src.width)
    cx1 = int(CROP["x1"] * src.width)
    cy0 = int(CROP["y0"] * src.height)
    cy1 = int(CROP["y1"] * src.height)
    clean = src.crop((cx0, cy0, cx1, cy1))
    print("clean crop", clean.size)

    # 3) write cleaned JPG + WebP
    clean.save(SRC / "store-front-clean.jpg", quality=JPEG_QUALITY, optimize=True, progressive=True)
    clean.save(OUT_WEBP / "store-front-clean.webp", quality=WEBP_QUALITY, method=6)

    # 4) encode the two portrait photos to WebP (their JPG stays as fallback / source of truth)
    vanity = Image.open(SRC / "vanity-mirror.jpg").convert("RGB")
    mens = Image.open(SRC / "mens-section.jpg").convert("RGB")
    print("vanity", vanity.size, "mens", mens.size)
    vanity.save(OUT_WEBP / "vanity-mirror.webp", quality=WEBP_QUALITY, method=6)
    mens.save(OUT_WEBP / "mens-section.webp", quality=WEBP_QUALITY, method=6)

    # 5) LQIP placeholders
    lqips = {
        "storefront": lqip(SRC / "store-front-clean.jpg"),
        "vanity": lqip(SRC / "vanity-mirror.jpg"),
        "mens": lqip(SRC / "mens-section.jpg"),
    }
    (SRC / "lqip.json").write_text(json.dumps(lqips, indent=1), encoding="utf-8")

    for k, v in lqips.items():
        print(f"LQIP {k}: {len(v)} chars")


if __name__ == "__main__":
    main()
