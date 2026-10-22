// Renders a baked Spine character on a 2D canvas.
//
// The geometry (triangle meshes in world space, per frame) was baked offline by
// tooling/bake.mjs using the official runtime. This file contains no Spine code,
// so shipping it does not pull in the Spine Runtimes License.
//
// Each slot = one cutout PNG drawn through its baked triangle mesh. UVs are
// constant per slot, so the texture is mapped once and only the vertices move.
(() => {
  "use strict";

  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");

  let rig = null;        // baked.json
  let images = {};       // path -> HTMLImageElement
  let current = "idle";
  let frame = 0;
  let playing = true;
  let speed = 1;
  let lastTime = 0;
  let acc = 0;

  // ---------------------------------------------------------------- loading

  async function loadImage(path) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = `assets/${path.split("/").pop()}.png`;
    });
  }

  async function boot() {
    const res = await fetch("assets/baked.json");
    rig = await res.json();

    const paths = [...new Set(rig.slots.map((s) => s.path))];
    await Promise.all(
      paths.map(async (p) => {
        const img = await loadImage(p);
        if (img) images[p] = img;
      })
    );

    const missing = paths.filter((p) => !images[p]);
    // expose for in-browser diagnostics
    window.__rig = rig;
    window.__images = images;
    window.__stats = { paths: paths.length, loaded: Object.keys(images).length, missing };
    if (missing.length) {
      document.getElementById("status").textContent =
        `missing ${missing.length} textures: ${missing.slice(0, 4).join(", ")}`;
    } else {
      document.getElementById("status").textContent =
        `${rig.slots.length} slots · ${Object.keys(rig.animations).length} animations · ${rig.skin}`;
    }

    buildUI();
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------- transform

  // Baked vertices are in Spine world units with +Y up. Canvas is +Y down.
  // Fit the rig bounds into the viewport with a margin, and flip Y.
  function computeTransform() {
    const b = rig.bounds;
    const pad = 40;
    const scale = Math.min(
      (canvas.width - pad * 2) / b.width,
      (canvas.height - pad * 2) / b.height
    );
    // Spine bounds: x = left, y = bottom, width/height
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    return {
      scale,
      toX: (x) => canvas.width / 2 + (x - cx) * scale,
      toY: (y) => canvas.height / 2 - (y - cy) * scale,
    };
  }

  // ------------------------------------------------------------------ draw

  // Draw one triangle of a mesh, texturing it from the slot's image.
  // Canvas2D has no UV mapping, so each triangle is clipped and the image is
  // drawn with an affine transform derived from its three UV/position pairs.
  function drawTri(img, uv, pos, tf) {
    const [x0, y0, x1, y1, x2, y2] = pos;
    const denom = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(denom) < 1e-6) return; // degenerate

    // UVs are normalised 0..1; convert to pixels of the source image.
    const iw = img.width;
    const ih = img.height;
    const u0 = uv[0] * iw, v0 = uv[1] * ih;
    const u1 = uv[2] * iw, v1 = uv[3] * ih;
    const u2 = uv[4] * iw, v2 = uv[5] * ih;

    const du1 = u1 - u0, dv1 = v1 - v0;
    const du2 = u2 - u0, dv2 = v2 - v0;
    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-9) return;

    const dx1 = x1 - x0, dy1 = y1 - y0;
    const dx2 = x2 - x0, dy2 = y2 - y0;

    // M = [dx1 dx2; dy1 dy2] * inv([du1 du2; dv1 dv2])
    const m00 = (dx1 * dv2 - dx2 * dv1) / det;
    const m01 = (dx2 * du1 - dx1 * du2) / det;
    const m10 = (dy1 * dv2 - dy2 * dv1) / det;
    const m11 = (dy2 * du1 - dy1 * du2) / det;
    const m02 = x0 - (m00 * u0 + m01 * v0);
    const m12 = y0 - (m10 * u0 + m11 * v0);

    // clip() antialiases the triangle edge, leaving a seam where neighbouring
    // triangles abut. Grow the clip triangle ~1px from its centroid so adjacent
    // triangles overlap instead of showing a hairline of the layer beneath.
    const gx = (x0 + x1 + x2) / 3;
    const gy = (y0 + y1 + y2) / 3;
    const grow = (x, y) => {
      const dx = x - gx, dy = y - gy;
      const len = Math.hypot(dx, dy) || 1;
      return [x + (dx / len) * 1.2, y + (dy / len) * 1.2];
    };
    const [ax, ay] = grow(x0, y0);
    const [bx, by] = grow(x1, y1);
    const [cx, cy] = grow(x2, y2);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(m00, m10, m01, m11, m02, m12);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  function drawFrame() {
    const anim = rig.animations[current];
    if (!anim || !anim.frames.length) return;
    const tf = computeTransform();
    const f = anim.frames[frame % anim.frames.length];

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Slots are in draw order; later slots paint over earlier ones.
    for (let i = 0; i < rig.slots.length; i++) {
      const meta = rig.slots[i];
      const verts = f[i];
      const img = images[meta.path];
      if (!verts || !img) continue;

      // world -> screen
      const pos = new Float32Array(verts.length);
      for (let k = 0; k < verts.length; k += 2) {
        pos[k] = tf.toX(verts[k]);
        pos[k + 1] = tf.toY(verts[k + 1]);
      }

      const uv = meta.uvs;
      const tris = meta.tris;
      for (let t = 0; t < tris.length; t += 3) {
        const a = tris[t], b = tris[t + 1], c = tris[t + 2];
        drawTri(
          img,
          [uv[a * 2], uv[a * 2 + 1], uv[b * 2], uv[b * 2 + 1], uv[c * 2], uv[c * 2 + 1]],
          [pos[a * 2], pos[a * 2 + 1], pos[b * 2], pos[b * 2 + 1], pos[c * 2], pos[c * 2 + 1]],
          tf
        );
      }
    }
  }

  // ------------------------------------------------------------------ loop

  function loop(t) {
    if (!rig) return;
    const dt = lastTime ? (t - lastTime) / 1000 : 0;
    lastTime = t;

    if (playing) {
      acc += dt * speed;
      const anim = rig.animations[current];
      const frameDur = 1 / anim.fps;
      while (acc >= frameDur) {
        acc -= frameDur;
        frame = (frame + 1) % anim.frames.length;
      }
    }

    drawFrame();
    requestAnimationFrame(loop);
  }

  // -------------------------------------------------------------------- UI

  function buildUI() {
    const bar = document.getElementById("anims");
    Object.keys(rig.animations).forEach((name) => {
      const b = document.createElement("button");
      b.textContent = name;
      b.className = name === current ? "on" : "";
      b.onclick = () => {
        current = name;
        frame = 0;
        acc = 0;
        [...bar.children].forEach((c) => c.classList.remove("on"));
        b.classList.add("on");
        updateInfo();
      };
      bar.appendChild(b);
    });
    updateInfo();
  }

  function updateInfo() {
    const a = rig.animations[current];
    document.getElementById("info").textContent =
      `${current} — ${a.duration.toFixed(2)}s · ${a.frames.length} frames @ ${a.fps}fps`;
  }

  document.getElementById("play").onclick = (e) => {
    playing = !playing;
    e.target.textContent = playing ? "pause" : "play";
  };
  document.getElementById("speed").oninput = (e) => {
    speed = Number(e.target.value);
    e.target.nextSibling.textContent = `${speed.toFixed(2)}×`;
  };

  boot();
})();
