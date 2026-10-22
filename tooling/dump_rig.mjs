// Dump rig + attachments + animation timelines into one JSON the web demo can use.
// Region attachment geometry (x, y, rotation, scale, width, height) is what places a
// part relative to its bone, so it has to be in here too.
import fs from "node:fs";
import {
  SkeletonBinary,
  AtlasAttachmentLoader,
  TextureAtlas,
  RegionAttachment,
  MeshAttachment,
  RotateTimeline,
  TranslateTimeline,
  ScaleTimeline,
  AttachmentTimeline,
  RGBATimeline,
} from "@esotericsoftware/spine-core";

const stub = {
  getImage: () => ({ width: 1, height: 1 }),
  setFilters: () => {},
  setWraps: () => {},
};

const [skelPath, atlasPath, skinName = "skin0"] = process.argv.slice(2);

const atlas = new TextureAtlas(fs.readFileSync(atlasPath, "utf8"));
for (const p of atlas.pages) p.setTexture(stub);
const bin = new SkeletonBinary(new AtlasAttachmentLoader(atlas));
const data = bin.readSkeletonData(new Uint8Array(fs.readFileSync(skelPath)));

const skin = data.findSkin(skinName) ?? data.skins[0];

// slot -> attachment geometry for the requested skin
const attachments = {};
for (const slot of data.slots) {
  const att = skin.getAttachment(slot.index, slot.attachmentName ?? "");
  if (!att) continue;
  const base = { name: att.name, type: att.constructor.name };
  if (att instanceof RegionAttachment) {
    Object.assign(base, {
      kind: "region",
      path: att.path,
      x: att.x, y: att.y, rotation: att.rotation,
      scaleX: att.scaleX, scaleY: att.scaleY,
      width: att.width, height: att.height,
      regionW: att.region ? att.region.width : att.width,
      regionH: att.region ? att.region.height : att.height,
    });
  } else if (att instanceof MeshAttachment) {
    // Setup-pose vertices are the placement truth: the bounding box gives the
    // quad offset relative to the bone, so a flat cutout render lines up.
    const verts = att.vertices ? Array.from(att.vertices) : [];
    let minX = 0, minY = 0, maxX = 0, maxY = 0;
    if (verts.length >= 2) {
      minX = minY = Infinity;
      maxX = maxY = -Infinity;
      for (let i = 0; i < verts.length; i += 2) {
        minX = Math.min(minX, verts[i]); maxX = Math.max(maxX, verts[i]);
        minY = Math.min(minY, verts[i + 1]); maxY = Math.max(maxY, verts[i + 1]);
      }
      if (!isFinite(minX)) { minX = minY = maxX = maxY = 0; }
    }
    Object.assign(base, {
      kind: "mesh",
      path: att.path,
      width: att.width, height: att.height,
      verts: verts.map((v) => +v.toFixed(3)),
      bbox: {
        x: +minX.toFixed(3), y: +minY.toFixed(3),
        w: +(maxX - minX).toFixed(3), h: +(maxY - minY).toFixed(3),
      },
    });
  } else {
    base.kind = "other";
  }
  attachments[slot.name] = base;
}

function dumpCurve(frames, valueCount) {
  const out = [];
  let i = 0;
  while (i < frames.length) {
    const time = frames[i++];
    const values = Array.from(frames.slice(i, i + valueCount));
    i += valueCount;
    out.push({ t: +time.toFixed(4), v: values.map((v) => +v.toFixed(4)) });
    // bezier coefficients follow the values when the curve is not linear;
    // consume 4 when they are present so frame parsing stays aligned
    if (i + 4 <= frames.length) {
      const c = frames.slice(i, i + 4);
      if (c.every((v) => typeof v === "number" && Math.abs(v) <= 2)) i += 4;
    }
  }
  return out;
}

const animations = {};
for (const a of data.animations) {
  const bone = { rotate: {}, translate: {}, scale: {} };
  const slotAtt = {};
  const slotColor = {};
  for (const t of a.timelines) {
    if (t instanceof RotateTimeline) bone.rotate[t.boneIndex] = dumpCurve(t.frames, 1);
    else if (t instanceof TranslateTimeline) bone.translate[t.boneIndex] = dumpCurve(t.frames, 2);
    else if (t instanceof ScaleTimeline) bone.scale[t.boneIndex] = dumpCurve(t.frames, 2);
    else if (t instanceof AttachmentTimeline)
      slotAtt[t.slotIndex] = {
        frames: Array.from(t.frames),
        names: Array.from(t.attachmentNames ?? []),
      };
    else if (t instanceof RGBATimeline) slotColor[t.slotIndex] = dumpCurve(t.frames, 4);
  }
  animations[a.name] = {
    duration: +a.duration.toFixed(4),
    bone, slotAtt, slotColor,
  };
}

const out = {
  version: data.version,
  bounds: { x: data.x, y: data.y, width: data.width, height: data.height },
  skin: skin.name,
  bones: data.bones.map((b) => ({
    name: b.name,
    parent: b.parent ? b.parent.name : null,
    x: b.x, y: b.y, rotation: b.rotation,
    scaleX: b.scaleX, scaleY: b.scaleY, length: b.length,
  })),
  slots: data.slots.map((s) => ({
    name: s.name,
    bone: s.boneData ? s.boneData.name : null,
    attachment: s.attachmentName ?? null,
  })),
  attachments,
  animations,
};

process.stdout.write(JSON.stringify(out));
