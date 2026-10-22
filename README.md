# Switching Heroes 5.60 — Reverse Engineering & Asset Extraction

Research and extraction artifacts for **Switching Heroes** (`com.zilliongames.collectionidle` v5.60, Unity 6000.2.15f1 + IL2CPP + Addressables).

Comprehensive documentation and census: [`REPORT.md`](REPORT.md).

## What is in this repository

This repository hosts the extraction scripts, validation tooling, interactive preview demo, and the complete set of extracted assets (~394 MB decoded):

| Directory / File | Description |
|---|---|
| `REPORT.md` | Full reverse-engineering census, atlas geometry maths, and extraction log |
| `out/textures/` | 1,069 Texture2D assets decoded to PNG (ASTC, ETC2, DXT, RGBA) |
| `out/audio/` | 266 decoded AudioClips in WAV format |
| `out/spine/` | 105 Spine `.skel` binary skeletons + 105 `.atlas` definitions + 55 game data tables |
| `out/spine_parts/` | 9,592 sliced region PNGs organized across 105 hero folders |
| `out/tables/` | 55 decoded JSON game data tables (heroes, skills, items, stages) |
| `demo/` | Interactive web preview demonstrating runtime sprite and atlas playback |
| `tooling/` | Node scripts (`bake.mjs`, `dump_rig.mjs`, `fix_uv.mjs`) using Spine 4.1 runtime |
| `extract_all.py` | UnityPy extraction pipeline from Android Addressables bundle |
| `cut_spine_parts.py` | Slices atlas sprites into standalone PNGs using rotated-footprint math |
| `check_atlas_geometry.py`| Verification script confirming 0% collision and full pixel coverage |

## Raw source APKs & binaries

To keep this repository fast to clone and below GitHub limits, the 800 MB raw upstream archives (`.xapk`, split `.apk` files, addressables bundle, and `libil2cpp.so`) are tracked via Git LFS in the sister repository:

👉 [**`v-reza/switchingheroes-raw`**](https://github.com/v-reza/switchingheroes-raw)

To re-run `extract_all.py` from raw upstream assets:
1. Clone `v-reza/switchingheroes-raw` alongside this directory (or into `ext/`).
2. Run `python extract_all.py` to regenerate `out/`.
