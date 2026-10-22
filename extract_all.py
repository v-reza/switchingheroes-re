import UnityPy, os, sys, json, time, traceback

BUNDLE = "ext/data/assets/aa/Android/defaultlocalgroup_assets_all_2eb3136a42b56be85f2aeb56ca73a63d.bundle"
ROOT = "out"
TEX = os.path.join(ROOT, "textures")
AUD = os.path.join(ROOT, "audio")
TXT = os.path.join(ROOT, "spine")
for d in (TEX, AUD, TXT):
    os.makedirs(d, exist_ok=True)

def safe(n):
    return "".join(c if c.isalnum() or c in "._- ()" else "_" for c in n).strip() or "unnamed"

env = UnityPy.load(BUNDLE)
t0 = time.time()
stats = {"texture2d": 0, "texture_fail": 0, "audio": 0, "audio_fail": 0,
         "textasset": 0, "textasset_fail": 0}
fails = []
seen = {}

for o in env.objects:
    t = o.type.name
    if t not in ("Texture2D", "AudioClip", "TextAsset"):
        continue
    try:
        d = o.read()
    except Exception as e:
        fails.append((t, "read", repr(e)[:160]))
        continue
    name = safe(getattr(d, "m_Name", "") or "unnamed")
    # de-dup identical names by suffixing an index
    if t == "Texture2D":
        try:
            img = d.image
            p = os.path.join(TEX, name + ".png")
            if os.path.exists(p):
                p = os.path.join(TEX, f"{name}__{stats['texture2d']}.png")
            img.save(p)
            stats["texture2d"] += 1
        except Exception as e:
            stats["texture_fail"] += 1
            fails.append((t, name, repr(e)[:160]))
    elif t == "AudioClip":
        try:
            for fn, data in d.samples.items():
                p = os.path.join(AUD, safe(fn))
                if os.path.exists(p):
                    p = os.path.join(AUD, f"{stats['audio']}_{safe(fn)}")
                with open(p, "wb") as fh:
                    fh.write(data)
                stats["audio"] += 1
        except Exception as e:
            stats["audio_fail"] += 1
            fails.append((t, name, repr(e)[:160]))
    else:
        try:
            s = d.m_Script
            raw = s.encode("utf-8", "surrogateescape") if isinstance(s, str) else bytes(s)
            p = os.path.join(TXT, name if name.endswith((".skel", ".atlas", ".json", ".txt")) else name + ".txt")
            if os.path.exists(p):
                p = os.path.join(TXT, f"{stats['textasset']}_{os.path.basename(p)}")
            with open(p, "wb") as fh:
                fh.write(raw)
            stats["textasset"] += 1
        except Exception as e:
            stats["textasset_fail"] += 1
            fails.append((t, name, repr(e)[:160]))

elapsed = time.time() - t0
report = {"stats": stats, "elapsed_s": round(elapsed, 1),
          "fail_count": len(fails), "fail_sample": fails[:40]}
with open(os.path.join(ROOT, "extract-report.json"), "w") as fh:
    json.dump(report, fh, indent=2)
print(json.dumps(report, indent=2))
