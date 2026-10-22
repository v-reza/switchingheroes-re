// Bake world-space geometry for every animation frame, using the official runtime
// OFFLINE only. Output is plain numbers (x, y, uv, triangles) so the browser demo
// needs no Spine runtime at all -- that keeps the shipped demo clear of the Spine
// Runtimes License.
//
// Weighted meshes store variable numbers per vertex, so vertex positions are never
// parsed by hand here: computeWorldVertices does it.
import fs from "node:fs";
import {
  SkeletonBinary, AtlasAttachmentLoader, TextureAtlas,
  Skeleton, AnimationState, AnimationStateData,
  RegionAttachment, MeshAttachment,
} from "@esotericsoftware/spine-core";

const stub = {
  getImage: () => ({ width: 1, height: 1 }),
  setFilters: () => {},
  setWraps: () => {},
};

const [skelPath, atlasPath, skinName = "skin0", fpsArg = "30"] =
  process.argv.slice(2);
const FPS = Number(fpsArg);

const atlas = new TextureAtlas(fs.readFileSync(atlasPath, "utf8"));
for (const p of atlas.pages) p.setTexture(stub);
const bin = new SkeletonBinary(new AtlasAttachmentLoader(atlas));
const data = bin.readSkeletonData(new Uint8Array(fs.readFileSync(skelPath)));

const skin = data.findSkin(skinName) ?? data.skins[0];

// Slots that actually carry a drawable attachment in this skin, in draw order.
const drawable = [];
for (const slot of data.slots) {
  const att = skin.getAttachment(slot.index, slot.attachmentName ?? "");
  if (!att) continue;
  const isRegion = att instanceof RegionAttachment;
  const isMesh = att instanceof MeshAttachment;
  if (!isRegion && !isMesh) continue;
  drawable.push({ slot, att, isRegion, isMesh });
}

// Static per-slot data: texture, uv, triangles, vertex count.
const slotMeta = drawable.map(({ slot, att, isRegion }) => {
  const nVerts = isRegion
    ? 4
    : (att.worldVerticesLength / 2) | 0;
  const uvs = isRegion ? Array.from(att.uvs) : Array.from(att.uvs);
  const tris = isRegion
    ? [0, 1, 2, 2, 3, 0]
    : Array.from(att.triangles ?? []);
  return {
    name: slot.name,
    bone: slot.boneData ? slot.boneData.name : null,
    path: att.path,
    nVerts,
    uvs: uvs.map((v) => +v.toFixed(5)),
    tris,
  };
});

function frameVerts(skeleton) {
  const out = [];
  for (let i = 0; i < drawable.length; i++) {
    const { slot, att, isRegion } = drawable[i];
    const nVerts = slotMeta[i].nVerts;
    const world = new Float32Array(nVerts * 2);
    try {
      if (isRegion) {
        att.computeWorldVertices(slot, world, 0, 2);
      } else {
        att.computeWorldVertices(slot, 0, nVerts * 2, world, 0, 2);
      }
    } catch (e) {
      return null;
    }
    const arr = [];
    for (let k = 0; k < world.length; k++) arr.push(+world[k].toFixed(2));
    out.push(arr);
  }
  return out;
}

const skeleton = new Skeleton(data);
skeleton.setSkin(skin);
skeleton.setToSetupPose();
const stateData = new AnimationStateData(data);
stateData.defaultMix = 0;
const state = new AnimationState(stateData);

// Resolve runtime slots by data name; SkeletonSlot.data.name is the stable handle.
const runtimeSlots = slotMeta.map((meta) =>
  skeleton.slots.find((s) => s.data.name === meta.name)
);

const animations = {};
for (const anim of data.animations) {
  skeleton.setToSetupPose();
  state.clearTracks();
  state.setAnimation(0, anim.name, true);

  const frames = [];
  const total = Math.max(1, Math.round(anim.duration * FPS));
  for (let f = 0; f <= total; f++) {
    const t = (f / total) * anim.duration;
    state.update(t);
    state.apply(skeleton);
    skeleton.updateWorldTransform();

    const frame = [];
    let ok = true;
    for (let i = 0; i < runtimeSlots.length; i++) {
      const slot = runtimeSlots[i];
      const meta = slotMeta[i];
      const att = slot.getAttachment();
      if (!att) { frame.push(null); continue; }
      const world = new Float32Array(meta.nVerts * 2);
      try {
        if (att instanceof RegionAttachment) {
          att.computeWorldVertices(slot, world, 0, 2);
        } else {
          att.computeWorldVertices(slot, 0, meta.nVerts * 2, world, 0, 2);
        }
      } catch (e) {
        ok = false;
        break;
      }
      frame.push(Array.from(world, (v) => +v.toFixed(2)));
    }
    if (!ok) break;
    frames.push(frame);
  }
  animations[anim.name] = {
    duration: +anim.duration.toFixed(4),
    fps: FPS,
    frames,
  };
  process.stderr.write(
    `${anim.name}: ${anim.duration.toFixed(2)}s ${frames.length} frames\n`
  );
}

const out = {
  version: data.version,
  bounds: { x: data.x, y: data.y, width: data.width, height: data.height },
  skin: skin.name,
  slots: slotMeta,
  animations,
};
process.stdout.write(JSON.stringify(out));
