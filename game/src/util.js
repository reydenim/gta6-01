// util.js — small helpers: seeded RNG, math, canvas textures. All original code.
window.SOL = window.SOL || {};
SOL.util = (() => {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
  const TAU = Math.PI * 2;
  function angDiff(a, b) {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }
  function angLerp(a, b, t) { return a + angDiff(a, b) * t; }
  // Deterministic RNG so the city looks the same every load.
  function mulberry32(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  // Circle (x,z,r) vs axis-aligned box (minX,minZ,maxX,maxZ). Returns push-out vector or null.
  function circleVsBox(px, pz, r, b) {
    const cx = clamp(px, b.minX, b.maxX), cz = clamp(pz, b.minZ, b.maxZ);
    const dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return null;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      return { x: (dx / d) * (r - d), z: (dz / d) * (r - d), depth: r - d };
    }
    // Center inside the box: push out along the smallest penetration axis.
    const pl = px - b.minX, pr = b.maxX - px, pt = pz - b.minZ, pb = b.maxZ - pz;
    const m = Math.min(pl, pr, pt, pb);
    if (m === pl) return { x: -(pl + r), z: 0, depth: pl + r };
    if (m === pr) return { x: pr + r, z: 0, depth: pr + r };
    if (m === pt) return { x: 0, z: -(pt + r), depth: pt + r };
    return { x: 0, z: pb + r, depth: pb + r };
  }
  // Make a canvas texture from a draw function. Returns THREE.CanvasTexture.
  function canvasTexture(THREE, w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }
  // Building facade: wall color + lit/unlit window grid.
  function facadeTexture(THREE, wall, litRatio, rng) {
    return canvasTexture(THREE, 128, 256, (g, w, h) => {
      g.fillStyle = wall; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 2);
      const cols = 6, rows = 14, ww = 12, wh = 9, gx = (w - cols * ww) / (cols + 1), gy = 8;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const lit = rng() < litRatio;
          g.fillStyle = lit ? (rng() < 0.6 ? '#ffd98a' : '#9fd8ff') : 'rgba(20,26,40,0.85)';
          g.fillRect(gx + c * (ww + gx), gy + r * (wh + 7), ww, wh);
        }
      }
    });
  }
  // Neon sign texture: glowing text on a dark plate.
  function signTexture(THREE, text, fg, bg) {
    return canvasTexture(THREE, 256, 64, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.font = 'bold 34px Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = fg; g.shadowBlur = 14;
      g.fillStyle = fg; g.fillText(text, w / 2, h / 2 + 1);
      g.shadowBlur = 0; g.fillStyle = '#ffffff';
      g.fillText(text, w / 2, h / 2 + 1);
    });
  }
  // Road asphalt with a dashed center line, tiled along the road.
  function roadTexture(THREE) {
    return canvasTexture(THREE, 128, 128, (g, w, h) => {
      g.fillStyle = '#33363d'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      for (let i = 0; i < 200; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      g.fillStyle = '#e8c33a';
      g.fillRect(w / 2 - 2, 8, 4, 40); g.fillRect(w / 2 - 2, 72, 4, 40);
      g.fillStyle = '#f2f2f2';
      g.fillRect(4, 0, 3, h); g.fillRect(w - 7, 0, 3, h);
    });
  }
  // Merge axis-aligned (optionally rotated) colored boxes into one BufferGeometry
  // with vertex colors, so a whole model costs one draw call.
  function mergeBoxes(THREE, parts) {
    const positions = [], normals = [], colors = [], indices = [];
    let base = 0;
    const col = new THREE.Color();
    for (const p of parts) {
      const g = new THREE.BoxGeometry(p.w, p.h, p.d);
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(p.rx || 0, p.ry || 0, p.rz || 0));
      m.setPosition(p.x || 0, p.y || 0, p.z || 0);
      g.applyMatrix4(m);
      const pos = g.attributes.position.array, nor = g.attributes.normal.array, idx = g.index.array;
      col.set(p.color);
      for (let i = 0; i < pos.length; i += 3) {
        positions.push(pos[i], pos[i + 1], pos[i + 2]);
        normals.push(nor[i], nor[i + 1], nor[i + 2]);
        colors.push(col.r, col.g, col.b);
      }
      for (let i = 0; i < idx.length; i++) indices.push(idx[i] + base);
      base += pos.length / 3;
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    return geo;
  }
  return { clamp, lerp, damp, TAU, angDiff, angLerp, mulberry32, pick, circleVsBox, canvasTexture, facadeTexture, signTexture, roadTexture, mergeBoxes };
})();
