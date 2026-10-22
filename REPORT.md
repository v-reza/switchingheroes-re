# Switching Heroes 5.60 — extraction report

Source: `C:\Users\Reza\Downloads\Switching+Heroes_5.60_APKPure.xapk` (293,848,953 bytes)
Package: `com.zilliongames.collectionidle` · versionName 5.60 · versionCode 30000097
minSdk 24 · targetSdk 36 · engine: **Unity 6000.2.15f1 + IL2CPP + Addressables**

## What the XAPK is

XAPK = a zip of split APKs. Three payloads:

| split | uncompressed | holds |
| --- | --- | --- |
| `com.zilliongames.collectionidle.apk` (base) | 127 MB | `classes*.dex` (7 files, 20,189 classes), `global-metadata.dat` (20 MB), `libunity` bootstrap, 583 png / 336 xml |
| `UnityDataAssetPack.apk` | 196 MB | `assets/aa/Android/*.bundle` — all game content, 265,518 objects |
| `config.arm64_v8a.apk` | 157 MB | `libil2cpp.so` (117 MB) + 28 other `.so` |

## Where the assets are

`assets/aa/Android/defaultlocalgroup_assets_all_*.bundle` — 135.8 MB, one
Addressables bundle holding the whole game. Object census:

    63,695 MonoBehaviour   60,623 GameObject   46,929 RectTransform
    42,920 CanvasRenderer  13,694 Transform    11,477 ParticleSystem
     5,778 SpriteRenderer   4,690 Sprite        1,072 Texture2D
       777 Material           266 AudioClip       265 TextAsset
       131 SpriteAtlas         91 Shader           64 AnimationClip
        16 Animator             4 VideoClip         3 Font

## Extracted output (`out/`)

| dir | files | MB | what |
| --- | --- | --- | --- |
| `textures/` | 1,069 | 157.5 | every Texture2D decoded to PNG (ASTC/DXT/ETC2 all decoded) |
| `audio/` | 266 | 120.2 | AudioClips to WAV |
| `spine/` | 265 | 21.7 | 105 `.skel` (Spine 4.1.24 binary) + 105 `.atlas` + 55 gzip tables |
| `spine_parts/` | 9,592 | 26.7 | every atlas region cut to its own PNG, 105 character dirs |
| `tables/` | 55 | 63.7 | decoded JSON game data |

Texture formats found: 799× ASTC 6x6 (fmt 50), 138× ETC2 (47), 85× DXT5 (4),
37× DXT1 (3), 8× Alpha8, 5× RGBA32. All decoded.

## Game data tables

55 tables, base64 → gzip (10-byte prefix to skip) → JSON. Key ones:

- `0_Character_227550.json` — 231 rows, 28 unique characters, 19 fields each
  (name, grade D→SSS, star, job, attribute, atk, hp, atkRange, atkSpd,
  changeSkillId, charSkillId)
- `0_Skill_227551.json` — 208 skills
- `0_Item_227558.json` — 1,553 items
- `0_Stage_225974.json` — 20,650 stage rows
- `0_Localized_227549.json` — 7,688 strings (ko/ja/zh/en)
- `0_UserLevel_225982.json` — 282,499 rows (the biggest)

Character breakdown: 28 unique heroes × grade/star variants.
Grades: D 6, C 12, B 18, A 27, S 36, SS 48, SSS 84.
Jobs: Fighter 63, Mage 60, Swordsman 54, Archer 54.

## Spine atlas geometry (the one non-obvious part)

`103_skin1.atlas` is 512×512 with `scale: 0.45`, 95 regions on page 1 and 94 on
page 2. Two things must be right or every crop is garbage:

1. **`bounds` is top-left origin in page pixel space.**
2. **For `rotate: 90`/`270` the stored `w,h` are the unrotated part's dimensions**,
   so the page footprint is `(h, w)` — swap them.

Measured, not assumed:

    as-written footprint : 12,340 content px uncovered, 42 rect collisions, 109% area fill (impossible)
    swapped footprint    :     20 content px uncovered,  0 collisions,  88 px round-trip error

Batch check across **161 atlas pages: 161 pass** the cover test (<0.5% uncovered).
Rerun with:

    .venv/Scripts/python.exe check_atlas_geometry.py out/spine/103_skin1.atlas

Undo rotation: `rotate:90` → `rotate(-90)`, `rotate:270` → `rotate(+90)`,
`rotate:180` → `rotate(180)`.

## Reproduce

    # 1. unpack
    unzip Switching+Heroes_5.60_APKPure.xapk -d xapk
    unzip xapk/UnityDataAssetPack.apk -d ext/data
    unzip xapk/config.arm64_v8a.apk -d ext/native
    unzip xapk/com.zilliongames.collectionidle.apk -d ext/base

    # 2. env
    uv venv .venv && uv pip install --python .venv/Scripts/python.exe UnityPy pillow numpy

    # 3. extract textures / audio / spine text assets
    .venv/Scripts/python.exe extract_all.py

    # 4. decode the gzip+base64 data tables
    #    (see tables step; skip 10 bytes, then zlib wbits=31)

    # 5. cut sprite parts from atlases
    .venv/Scripts/python.exe cut_spine_parts.py
    .venv/Scripts/python.exe check_atlas_geometry.py out/spine/103_skin1.atlas

## Known gaps

- 3 textures not saved: all named `Font Texture`, and they are **empty** — 0×0,
  0 bytes, format DXT5. Unity fills these at runtime from the TTF. Nothing lost.
  The `PermissionError(13)` in the first run's log was a misleading symptom: the
  decode of a zero-size image raises inside PIL and the resulting exception was
  reported as a save failure. Verified by reading the object directly
  (`m_Width=0, m_Height=0, image_data=0 bytes`), not inferred.
- Spine `.skel` binary is **not** parsed beyond the version header. A hand-rolled
  4.1 reader was attempted and abandoned (the version field is not where the
  format docs suggest). Composing a posed character needs a real Spine runtime
  (spine-python / spine-ts), which is not installed. The cut parts are correct
  and load into Spine editors; only the pose composition is unverified.
- 12 atlas pages name their PNG with commas (`monster_1,2,3.png`) while the
  extracted texture uses underscores. Handled by fallback in `cut_spine_parts.py`.
- IL2CPP code was **not** decompiled. `libil2cpp.so` + `global-metadata.dat` are
  present and would need Il2CppDumper/REA native engines (Ghidra not installed).

## Licensing

`com.zilliongames.collectionidle`, published by Zillion Games. Not open source.
Assets are the publisher's; treat as reference-only, not redistributable.
