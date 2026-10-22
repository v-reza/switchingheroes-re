"""Assert the baked rig is renderable, without a browser.

Run: .venv/Scripts/python.exe check_baked.py

Catches the class of bug that actually bit this demo: UVs left in atlas-pixel
space instead of normalised to each cut-out part. A raw Spine export has UVs
like 11.7..113.6, which silently renders as scattered fragments rather than
failing loudly -- so assert the range here.
"""
import json, sys, os

BAKED = "demo/assets/baked.json"
PARTS = "demo/assets"


def main():
    rig = json.load(open(BAKED, encoding="utf-8"))
    errs = []

    slots = rig["slots"]
    anims = rig["animations"]
    assert slots, "no slots"
    assert anims, "no animations"

    # every slot needs geometry, uvs, triangles and a texture on disk
    for s in slots:
        name = s["name"]
        if len(s["uvs"]) != s["nVerts"] * 2:
            errs.append(f"{name}: uv count {len(s['uvs'])} != nVerts*2 {s['nVerts']*2}")
        if not s["tris"]:
            errs.append(f"{name}: no triangles")
        if len(s["tris"]) % 3:
            errs.append(f"{name}: triangle index count not a multiple of 3")
        tex = os.path.join(PARTS, s["path"].split("/")[-1] + ".png")
        if not os.path.exists(tex):
            errs.append(f"{name}: missing texture {tex}")

    # the regression guard: normalised UVs, allowing a small mesh-extrude overshoot
    # (Spine grows mesh vertices past the region edge by ~1px, so ~5% on a tiny
    # 19px part is expected; atlas-pixel UVs would be 100x outside this band)
    for s in slots:
        lo, hi = min(s["uvs"]), max(s["uvs"])
        if lo < -0.10 or hi > 1.10:
            errs.append(f"{s['name']}: uv out of range [{lo:.3f},{hi:.3f}] (atlas-space UVs?)")

    # every frame must supply vertices for every slot, except where the animation
    # swaps the attachment away (e.g. 'happy' clears an eye slot for an expression)
    swapped = 0
    for aname, a in anims.items():
        if not a["frames"]:
            errs.append(f"{aname}: no frames")
            continue
        for fi, f in enumerate(a["frames"]):
            if len(f) != len(slots):
                errs.append(f"{aname} frame {fi}: {len(f)} slots, expected {len(slots)}")
                break
            for si, v in enumerate(f):
                if v is None:
                    swapped += 1
                    break

    nframes = sum(len(a["frames"]) for a in anims.values())
    if errs:
        print(f"FAIL ({len(errs)} problems)")
        for e in errs[:25]:
            print("  -", e)
        return 1

    print(
        f"PASS  slots={len(slots)}  animations={len(anims)}  "
        f"frames={nframes}  textures={len(slots)}"
    )
    print(f"      uv normalised, geometry complete, {swapped} attachment-swap frames skipped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
