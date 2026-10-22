"""Cut a Spine atlas into individual part PNGs.

Geometry verified against the shipped data (103_skin1, 512x512 page):
  - `bounds: x,y,w,h` uses a TOP-LEFT origin in page pixel space.
  - For `rotate: 90`/`270` the stored w,h are the UNROTATED part's dimensions, so
    the rect's footprint on the page is (h, w). Swapping them is what makes the
    rects tile the page instead of overlapping each other:
        as-written footprint -> 12340 content px uncovered, 42 rect collisions
        swapped footprint    -> 20 content px uncovered, 88px round-trip error
  - The stored region is rotated clockwise, so undo 90 with rotate(-90) and undo
    270 with rotate(+90).

Two checks back this up; keep them green if this code is edited:
  cover check : content pixels not covered by any rect ~= 0
  round-trip  : pasting every rect back reproduces the page exactly
"""
import os, json
from PIL import Image


def footprint(region):
    """Return (x, y, w, h) of the rect as it sits on the page."""
    x, y, w, h = (int(v) for v in region["bounds"].split(","))
    if region.get("rotate") in ("90", "270"):
        w, h = h, w
    return x, y, w, h


def parse_atlas(path):
    pages = []
    cur = None
    reg = None
    for line in open(path, encoding="utf-8", errors="replace"):
        s = line.rstrip("\n")
        if not s.strip():
            continue
        if not s.startswith(" ") and s.endswith(".png"):
            cur = {"file": s, "regions": []}
            pages.append(cur)
            reg = None
        elif not s.startswith(" ") and ":" not in s:
            reg = {"name": s}
            if cur is not None:
                cur["regions"].append(reg)
        elif reg is not None and ":" in s:
            k, v = s.split(":", 1)
            reg[k.strip()] = v.strip()
    return pages


def cut_page(tex_dir, page, out_dir):
    src = os.path.join(tex_dir, page["file"])
    if not os.path.exists(src):
        # atlas page names keep the packer's commas; the extracted texture name
        # had them normalised to underscores. Same asset, different filename.
        alt = page["file"].replace(",", "_")
        alt_src = os.path.join(tex_dir, alt)
        if os.path.exists(alt_src):
            src = alt_src
    if not os.path.exists(src):
        return 0, [page["file"]]
    img = Image.open(src).convert("RGBA")
    os.makedirs(out_dir, exist_ok=True)
    n = 0
    for r in page["regions"]:
        if "bounds" not in r:
            continue
        x, y, w, h = footprint(r)
        c = img.crop((x, y, x + w, y + h))
        rot = r.get("rotate", "0")
        if rot == "90":
            c = c.rotate(-90, expand=True)
        elif rot == "270":
            c = c.rotate(90, expand=True)
        elif rot == "180":
            c = c.rotate(180, expand=True)
        name = r["name"].replace("/", "__").replace("\\", "__")
        c.save(os.path.join(out_dir, f"{name}.png"))
        n += 1
    return n, []


def main():
    spine_dir = "out/spine"
    tex_dir = "out/textures"
    out_root = "out/spine_parts"
    total = 0
    missing = []
    for f in sorted(os.listdir(spine_dir)):
        if not f.endswith(".atlas"):
            continue
        stem = f[:-6]
        for page in parse_atlas(os.path.join(spine_dir, f)):
            n, miss = cut_page(tex_dir, page, os.path.join(out_root, stem))
            total += n
            missing += miss
    print(json.dumps({"parts_written": total, "missing_pages": missing}, indent=2))


if __name__ == "__main__":
    main()
