// city.js — Solmar City: a sun-soaked coastal grid city. Roads, buildings with canvas
// facades, palms, lamps, billboards, landmarks and a beach. All procedural, all original.
window.SOL = window.SOL || {};
SOL.city = (() => {
  const U = SOL.util;
  const ROAD_AT = [-156, -78, 0, 78, 156];   // road centerlines on both axes
  const ROAD_W = 14, BLOCK = 64, STEP = 78;  // block size, road spacing
  const BOUND = 172;                          // playable half-extent (walls at the edge)
  const SIGNS = [
    ['HOTEL', '#ff5fa2', '#1c1030'], ['CASINO', '#ffd23e', '#241a00'],
    ['TACOS', '#7dff5f', '#0d2b12'], ['PALMS', '#5fd8ff', '#0a2233'],
    ['CLUB NEON', '#ff4d6d', '#20060f'], ['SURF SHOP', '#5ff2d6', '#06231f'],
    ['PIZZA', '#ffb14d', '#2b1503'], ['MOTEL', '#c99aff', '#1d1030'],
  ];
  const LANDMARKS = {
    garage: { x: 39, z: 39, name: 'Marina Garage' },
    cafe: { x: -117, z: 117, name: 'Harbor Cafe' },
    hotel: { x: 117, z: -39, name: 'Palm Hotel' },
    club: { x: -39, z: -117, name: 'Neon Club' },
    dealer: { x: 117, z: 117, name: 'Sunset Motors' },
  };
  let colliders = [], roads = [], signMats = [];
  let THREE_ = null;

  function box(w, h, d, mat, x, y, z, cast = true, recv = true) {
    const m = new THREE_.Mesh(new THREE_.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = cast; m.receiveShadow = recv;
    return m;
  }

  function init(scene, THREE) {
    THREE_ = THREE;
    const rng = U.mulberry32(1337);
    const group = new THREE.Group();
    group.name = 'city';
    scene.add(group);
    colliders = []; roads = []; signMats = []; palms = [];

    // --- ground: warm concrete base, sand beach + ocean to the east ---
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x9a938a, roughness: 1 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(460, 460), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    group.add(ground);
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(60, 460), new THREE.MeshStandardMaterial({ color: 0xe8d29a, roughness: 1 }));
    sand.rotation.x = -Math.PI / 2; sand.position.set(200, 0.05, 0); sand.receiveShadow = true;
    group.add(sand);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(200, 460), new THREE.MeshStandardMaterial({ color: 0x2f8fc9, roughness: 0.25, metalness: 0.1 }));
    water.rotation.x = -Math.PI / 2; water.position.set(330, 0.02, 0);
    group.add(water);

    // --- roads: asphalt strips with dashed center lines ---
    const roadTex = U.roadTexture(THREE);
    roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
    const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 });
    for (const at of ROAD_AT) {
      for (const axis of ['x', 'z']) {
        const tex = roadTex.clone();
        tex.needsUpdate = true;
        tex.repeat.set(26, 1);
        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
        const road = new THREE.Mesh(new THREE.PlaneGeometry(344, ROAD_W), mat);
        road.rotation.x = -Math.PI / 2;
        road.position.y = 0.06;
        if (axis === 'x') { road.position.set(0, 0.06, at); }
        else { road.rotation.z = Math.PI / 2; road.position.set(at, 0.06, 0); }
        road.receiveShadow = true;
        group.add(road);
        roads.push({ axis, at, from: -172, to: 172 });
      }
    }

    // --- blocks: sidewalk slabs + buildings (one mesh each: facade sides + dark roof) ---
    const wallColors = ['#e8c9a0', '#d8b48a', '#c9d6dd', '#e5a58a', '#b7c9a8', '#d9c2e8', '#f0e0c0'];
    const facades = wallColors.map((c) => U.facadeTexture(THREE, c, 0.35, U.mulberry32(99 + wallColors.indexOf(c) * 7)));
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 1 });
    const sideMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 1 });
    const signMeshes = [];
    let signIdx = 0;
    const palmSpots = [];
    for (let bi = -2; bi <= 1; bi++) {
      for (let bj = -2; bj <= 1; bj++) {
        const cx = (bi + 0.5) * STEP, cz = (bj + 0.5) * STEP;
        // sidewalk slab
        const slab = box(BLOCK, 0.3, BLOCK, new THREE.MeshStandardMaterial({ color: 0xb9b2a4, roughness: 1 }), cx, 0.15, cz, false, true);
        group.add(slab);
        // Landmark blocks keep their own landmark building: no regular buildings here.
        const isLandmark = Object.values(LANDMARKS).some((lm) => lm.x === cx && lm.z === cz);
        if (isLandmark) {
          // palms only, then next block
          for (let p = 0; p < 3; p++) {
            const edge = Math.floor(rng() * 4);
            const t = (rng() - 0.5) * 52;
            let px = cx, pz = cz;
            if (edge === 0) { px = cx + t; pz = cz - BLOCK / 2 + 2; }
            if (edge === 1) { px = cx + t; pz = cz + BLOCK / 2 - 2; }
            if (edge === 2) { px = cx - BLOCK / 2 + 2; pz = cz + t; }
            if (edge === 3) { px = cx + BLOCK / 2 - 2; pz = cz + t; }
            palmSpots.push([px, pz, (rng() - 0.5) * 0.16]);
          }
          continue;
        }
        const n = 1 + Math.floor(rng() * 3); // 1-3 buildings per block
        const spots = n === 1 ? [[0, 0, 34, 34]] : n === 2 ? [[-14, 0, 26, 30], [14, 0, 26, 30]] : [[-14, -14, 24, 24], [14, -14, 24, 24], [0, 14, 30, 22]];
        for (const [ox, oz, w, d] of spots) {
          const h = 10 + rng() * 32;
          const faceMat = new THREE.MeshStandardMaterial({ map: U.pick(rng, facades), roughness: 0.9 });
          const geo = new THREE.BoxGeometry(w, h, d);
          // material array: [right, left, top(roof), bottom, front, back]
          const b = new THREE.Mesh(geo, [faceMat, faceMat, roofMat, sideMat, faceMat, faceMat]);
          b.position.set(cx + ox, h / 2 + 0.3, cz + oz);
          b.castShadow = true; b.receiveShadow = true;
          group.add(b);
          colliders.push({ minX: cx + ox - w / 2, maxX: cx + ox + w / 2, minZ: cz + oz - d / 2, maxZ: cz + oz + d / 2 });
          // neon sign on some tall buildings, facing a road
          if (h > 22 && rng() < 0.55) {
            const [text, fg, bg] = SIGNS[signIdx++ % SIGNS.length];
            const smat = new THREE.MeshBasicMaterial({ map: U.signTexture(THREE, text, fg, bg) });
            signMats.push(smat);
            const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), smat);
            const face = rng() < 0.5 ? 0 : 1;
            if (face === 0) { sign.position.set(cx + ox, h * 0.75, cz + oz + d / 2 + 0.15); }
            else { sign.rotation.y = Math.PI / 2; sign.position.set(cx + ox + w / 2 + 0.15, h * 0.75, cz + oz); }
            group.add(sign);
          }
        }
        // palms along the block edges (spots collected, built as instanced meshes below)
        for (let p = 0; p < 3; p++) {
          const edge = Math.floor(rng() * 4);
          const t = (rng() - 0.5) * 52;
          let px = cx, pz = cz;
          if (edge === 0) { px = cx + t; pz = cz - BLOCK / 2 + 2; }
          if (edge === 1) { px = cx + t; pz = cz + BLOCK / 2 - 2; }
          if (edge === 2) { px = cx - BLOCK / 2 + 2; pz = cz + t; }
          if (edge === 3) { px = cx + BLOCK / 2 - 2; pz = cz + t; }
          palmSpots.push([px, pz, (rng() - 0.5) * 0.16]);
        }
      }
    }
    buildInstancedPalms(group, THREE, palmSpots);

    // --- landmarks: low distinct buildings with big signs ---
    makeLandmark(group, THREE, LANDMARKS.garage, '#e85d3d', 'MARINA GARAGE', 26, 10, 18);
    makeLandmark(group, THREE, LANDMARKS.cafe, '#3d8fe8', 'HARBOR CAFE', 20, 8, 14);
    makeLandmark(group, THREE, LANDMARKS.hotel, '#e8a33d', 'PALM HOTEL', 24, 26, 16);
    makeLandmark(group, THREE, LANDMARKS.club, '#b23de8', 'NEON CLUB', 22, 12, 16);
    makeLandmark(group, THREE, LANDMARKS.dealer, '#3de88a', 'SUNSET MOTORS', 28, 9, 18);

    // --- street lamps at intersections (instanced: one draw call for poles, one for heads) ---
    const lampSpots = [];
    for (const at of ROAD_AT) {
      for (const at2 of ROAD_AT) {
        if ((at + at2) % 156 === 0) continue;
        lampSpots.push([at + 8, at2 + 8]);
      }
    }
    buildInstancedLamps(group, THREE, lampSpots);

    // --- billboards ---
    makeBillboard(group, THREE, -160, 26, 0, 'SOLMAR CITY', '#ff7a3d', Math.PI / 2);
    makeBillboard(group, THREE, 160, 24, -78, 'PALM BEACH', '#2f8fc9', -Math.PI / 2);
    makeBillboard(group, THREE, 0, 30, -160, 'VISIT THE MARINA', '#e83d7a', 0);

    // --- boundary walls (invisible colliders at the city edge) ---
    colliders.push({ minX: -BOUND - 10, maxX: -BOUND, minZ: -400, maxZ: 400 });
    colliders.push({ minX: BOUND, maxX: BOUND + 10, minZ: -400, maxZ: 400 });
    colliders.push({ minX: -400, maxX: 400, minZ: -BOUND - 10, maxZ: -BOUND });
    colliders.push({ minX: -400, maxX: 400, minZ: BOUND, maxZ: BOUND + 10 });
    return { colliders, roads, landmarks: LANDMARKS, bound: BOUND };
  }

  // All palms as two InstancedMeshes (trunks + fronds): 2 draw calls for the whole city.
  function buildInstancedPalms(group, THREE, spots) {
    const dummy = new THREE.Object3D();
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.35, 7, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 1 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    trunks.castShadow = true;
    const frondGeo = new THREE.BoxGeometry(0.12, 0.05, 3.4);
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x3f9e4d, roughness: 1, side: THREE.DoubleSide });
    const fronds = new THREE.InstancedMesh(frondGeo, frondMat, spots.length * 6);
    fronds.castShadow = true;
    spots.forEach(([x, z, tilt], i) => {
      dummy.position.set(x, 3.8, z);
      dummy.rotation.set(0, 0, tilt);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      for (let f = 0; f < 6; f++) {
        const a = (f / 6) * Math.PI * 2;
        dummy.position.set(x + Math.sin(a) * 1.2, 7.4, z + Math.cos(a) * 1.2);
        dummy.rotation.set(0.5 * Math.cos(a), a, -0.5 * Math.sin(a));
        dummy.updateMatrix();
        fronds.setMatrixAt(i * 6 + f, dummy.matrix);
      }
    });
    trunks.instanceMatrix.needsUpdate = true;
    fronds.instanceMatrix.needsUpdate = true;
    group.add(trunks); group.add(fronds);
  }

  function buildInstancedLamps(group, THREE, spots) {
    const dummy = new THREE.Object3D();
    const poles = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.12, 0.16, 7, 6),
      new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.6, metalness: 0.5 }),
      spots.length,
    );
    poles.castShadow = true;
    const heads = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.35, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
      spots.length,
    );
    spots.forEach(([x, z], i) => {
      dummy.position.set(x, 3.5, z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 7.1, z); dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
    });
    poles.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    group.add(poles); group.add(heads);
  }

  function makeLandmark(group, THREE, lm, color, signText, w, h, d) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(lm.x, h / 2 + 0.3, lm.z);
    b.castShadow = true; b.receiveShadow = true;
    group.add(b);
    const smat = new THREE.MeshBasicMaterial({ map: U.signTexture(THREE, signText, '#ffffff', '#222222') });
    signMats.push(smat);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, 3.2), smat);
    sign.position.set(lm.x, h - 1.5, lm.z + d / 2 + 0.12);
    group.add(sign);
    colliders.push({ minX: lm.x - w / 2, maxX: lm.x + w / 2, minZ: lm.z - d / 2, maxZ: lm.z + d / 2 });
  }

  function makeBillboard(group, THREE, x, y, z, text, color, rotY) {
    const mat = new THREE.MeshBasicMaterial({ map: U.signTexture(THREE, text, '#ffffff', color) });
    signMats.push(mat);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(24, 6), mat);
    board.position.set(x, y, z); board.rotation.y = rotY;
    group.add(board);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.8 });
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, y - 3, 6), legMat);
    leg.position.set(x, (y - 3) / 2, z);
    group.add(leg);
  }

  // Resolve a circle against all building colliders. Returns true if it collided.
  function collide(px, pz, r, out) {
    let hit = false;
    for (const b of colliders) {
      const push = U.circleVsBox(px, pz, r, b);
      if (push) {
        out.x += push.x; out.z += push.z; hit = true;
      }
    }
    return hit;
  }

  // A free point on a road (for spawning cars / peds).
  function roadPoint(rng) {
    const road = U.pick(rng, roads);
    const t = (rng() * 2 - 1) * 160;
    const lane = (rng() < 0.5 ? -1 : 1) * 3.5;
    if (road.axis === 'x') return { x: t, z: road.at + lane, axis: 'x', at: road.at, dir: lane > 0 ? 1 : -1 };
    return { x: road.at + lane, z: t, axis: 'z', at: road.at, dir: lane > 0 ? 1 : -1 };
  }

  function update(dt, time) {
    // Neon signs gently pulse.
    for (let i = 0; i < signMats.length; i++) {
      signMats[i].color.setScalar(0.92 + 0.08 * Math.sin(time * 2 + i * 1.7));
    }
  }

  return { init, collide, roadPoint, update, ROAD_AT, BOUND, LANDMARKS };
})();
