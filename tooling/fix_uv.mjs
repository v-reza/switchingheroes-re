// Convert atlas-space UVs into 0..1 UVs of each CUT-OUT part PNG.
//
// Spine stores attachment UVs in atlas page pixels, relative to the region's own
// rect (0..regionWidth, 0..regionHeight) -- not 0..1, and not page-absolute. The
// demo draws each part from its own cropped PNG, so UVs must be renormalised to
// that crop's size, and un-rotated for regions the packer stored rotated.
import fs from "node:fs";

const [bakedPath, atlasPath, outPath] = process.argv.slice(2);

function parseAtlas(text) {
  const pages = [];
  let cur = null, reg = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line.trim()) continue;
    const indented = line.startsWith(" ");
    const s = line.trim();
    if (!indented && s.endsWith(".png")) {
      cur = { file: s, regions: {} };
      pages.push(cur);
      reg = null;
    } else if (!indented && !s.includes(":")) {
      reg = s;
      if (cur) cur.regions[reg] = {};
    } else if (reg && s.includes(":")) {
      const i = s.indexOf(":");
      cur.regions[reg][s.slice(0, i).trim()] = s.slice(i + 1).trim();
    }
  }
  return pages;
}

const pages = parseAtlas(fs.readFileSync(atlasPath, "utf8"));
const regions = {};
for (const p of pages) {
  for (const [name, r] of Object.entries(p.regions)) {
    if (!r.bounds) continue;
    const [x, y, w, h] = r.bounds.split(",").map(Number);
    const rot = r.rotate === "90" || r.rotate === "270";
    // the cut-out PNG's own dimensions: rotated regions were stored sideways
    const cutW = rot ? h : w;
    const cutH = rot ? w : h;
    regions[name] = { w: cutW, h: cutH, rot: r.rotate ?? "0" };
  }
}

const data = JSON.parse(fs.readFileSync(bakedPath, "utf8"));
let fixed = 0, missing = [];

for (const slot of data.slots) {
  const r = regions[slot.path];
  if (!r) { missing.push(slot.path); continue; }

  const uv = slot.uvs;
  const out = [];
  for (let i = 0; i < uv.length; i += 2) {
    let u = uv[i] / r.w;
    let v = uv[i + 1] / r.h;
    // A region stored rotated 90 is drawn sideways in the atlas; the cut-out PNG
    // was un-rotated, so the UV axes swap to match.
    if (r.rot === "90") { const t = u; u = v; v = 1 - t; }
    else if (r.rot === "270") { const t = u; u = 1 - v; v = t; }
    else if (r.rot === "180") { u = 1 - u; v = 1 - v; }
    out.push(+u.toFixed(5), +v.toFixed(5));
  }
  slot.uvs = out;
  fixed++;
}

fs.writeFileSync(outPath, JSON.stringify(data));
console.log(JSON.stringify({ slots_fixed: fixed, missing_regions: missing }, null, 1));
