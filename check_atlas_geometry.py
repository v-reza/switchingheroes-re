"""Verify that an atlas's rects actually tile its page.

Run: .venv/Scripts/python.exe check_atlas_geometry.py out/spine/103_skin1.atlas

Two properties must hold for the rect coordinates to be usable for cutting:
  1. cover      - every pixel with alpha content belongs to some rect
  2. round-trip - pasting each rect's crop back reproduces the page exactly

The `swap` flag reports whether rotated rects needed their w/h swapped to reach
those numbers. For this game's packs it is required (see cut_spine_parts.py).
"""
import sys, os
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cut_spine_parts import parse_atlas, footprint  # noqa: E402


def check(atlas_path, tex_dir="out/textures"):
    pages = parse_atlas(atlas_path)
    for page in pages:
        src = os.path.join(tex_dir, page["file"])
        if not os.path.exists(src):
            src = os.path.join(tex_dir, page["file"].replace(",", "_"))
        if not os.path.exists(src):
            print(f"{page['file']}: TEXTURE MISSING")
            continue
        img = Image.open(src).convert("RGBA")
        a = np.array(img)
        alpha = a[:, :, 3]
        H, W = alpha.shape

        cover = np.zeros((H, W), bool)
        rt = np.zeros_like(a)
        skipped = 0
        for r in page["regions"]:
            if "bounds" not in r:
                continue
            x, y, w, h = footprint(r)
            if x + w > W or y + h > H:
                skipped += 1
                continue
            cover[y : y + h, x : x + w] = True
            rt[y : y + h, x : x + w] = a[y : y + h, x : x + w]

        uncovered = int(((alpha > 0) & ~cover).sum())
        mismatch = int((rt != a).any(axis=2).sum())
        content = int((alpha > 0).sum())
        print(
            f"{page['file']:24} regions={len(page['regions']):>3} "
            f"content={content:>7} uncovered={uncovered:>5} "
            f"roundtrip_mismatch={mismatch:>5} out_of_bounds={skipped}"
        )


if __name__ == "__main__":
    check(sys.argv[1] if len(sys.argv) > 1 else "out/spine/103_skin1.atlas")
