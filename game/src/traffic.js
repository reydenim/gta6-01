// traffic.js — AI traffic cars on the road grid and pedestrians on the sidewalks.
// Traffic follows lanes and turns at intersections; peds walk block perimeters and flee.
window.SOL = window.SOL || {};
SOL.traffic = (() => {
  const U = SOL.util;
  let THREE_ = null, scene_ = null;
  let cars = [], peds = [];
  const CAR_COUNT = 12, PED_COUNT = 18;

  function headingFor(axis, dir) {
    if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    return dir > 0 ? 0 : Math.PI;
  }
  function laneOffset(axis, dir) {
    // Right-hand traffic: +X drives on the -Z side of its road, +Z on the +X side.
    if (axis === 'x') return dir > 0 ? -3.5 : 3.5;
    return dir > 0 ? 3.5 : -3.5;
  }

  function init(scene, THREE, rng) {
    THREE_ = THREE; scene_ = scene;
    cars = []; peds = [];
    const types = ['sedan', 'sedan', 'taxi', 'van', 'sedan', 'taxi'];
    for (let i = 0; i < CAR_COUNT; i++) {
      const p = SOL.city.roadPoint(rng);
      const car = SOL.vehicles.createCar(scene, {
        x: p.x, z: p.z, heading: headingFor(p.axis, p.dir),
        type: U.pick(rng, types), rng,
      });
      const t = {
        car, axis: p.axis, at: p.at, dir: p.dir,
        u: p.axis === 'x' ? p.x : p.z,
        speed: 8 + rng() * 4, target: 9 + rng() * 3,
        turnCooldown: 1 + rng() * 2,
      };
      cars.push(t);
    }
    for (let i = 0; i < PED_COUNT; i++) {
      const bi = Math.floor(rng() * 4) - 2, bj = Math.floor(rng() * 4) - 2;
      const bcx = (bi + 0.5) * 78, bcz = (bj + 0.5) * 78;
      const mesh = SOL.player.makePerson(U.pick(rng, [0x3a7bd5, 0xd53a7b, 0x3ad5a2, 0xd5a23a, 0x8a5fd8, 0xe8e8e8]));
      mesh.position.set(bcx + 30, 0, bcz - 30);
      scene.add(mesh);
      peds.push({
        mesh, blockX: bcx, blockZ: bcz, edge: Math.floor(rng() * 4),
        t: rng() * 60, speed: 1.4 + rng() * 1.1, walkPhase: rng() * 6,
        state: 'walk', downTimer: 0, fleeTimer: 0, fleeX: 0, fleeZ: 0,
      });
    }
  }

  function blockedAhead(t, allCars, playerCar) {
    const fx = Math.sin(t.car.heading), fz = Math.cos(t.car.heading);
    const ahead = [];
    for (const o of allCars) {
      if (o === t.car) continue;
      const dx = o.x - t.car.x, dz = o.z - t.car.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 11 && dist > 0.1 && (dx * fx + dz * fz) / dist > 0.75) ahead.push(dist);
    }
    if (playerCar) {
      const dx = playerCar.x - t.car.x, dz = playerCar.z - t.car.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 11 && dist > 0.1 && (dx * fx + dz * fz) / dist > 0.75) ahead.push(dist);
    }
    return ahead.length ? Math.min(...ahead) : null;
  }

  function update(dt, playerCar, rng) {
    const allCars = cars.map((t) => t.car);
    for (const t of cars) {
      // speed: slow down for cars ahead
      const d = blockedAhead(t, allCars, playerCar);
      let want = t.target;
      if (d != null) want = d < 6 ? 0 : t.target * (d / 11);
      t.car.speed = U.damp(t.car.speed, want, 1.5, dt);
      t.u += t.car.speed * t.dir * dt;
      // wrap around the city edge
      if (t.u > 168) t.u = -168;
      if (t.u < -168) t.u = 168;
      // maybe turn at an intersection
      t.turnCooldown -= dt;
      if (t.turnCooldown <= 0) {
        for (const c of SOL.city.ROAD_AT) {
          if (Math.abs(t.u - c) < 1.6 && rng() < 0.4) {
            const newAxis = t.axis === 'x' ? 'z' : 'x';
            t.axis = newAxis;
            t.at = c;
            t.u = t.axis === 'x' ? t.car.x : t.car.z;
            t.dir = rng() < 0.5 ? 1 : -1;
            t.turnCooldown = 2.5;
            break;
          }
        }
      }
      const lane = laneOffset(t.axis, t.dir);
      t.car.heading = headingFor(t.axis, t.dir);
      if (t.axis === 'x') { t.car.x = t.u; t.car.z = t.at + lane; }
      else { t.car.x = t.at + lane; t.car.z = t.u; }
      t.car.mesh.position.set(t.car.x, 0, t.car.z);
      t.car.mesh.rotation.y = t.car.heading;
      const wSpin = (t.car.speed * dt) / 0.38;
      for (const w of t.car.mesh.userData.wheels) w.rotateY(wSpin);
    }
    // pedestrians
    for (const p of peds) {
      if (p.state === 'down') {
        p.downTimer -= dt;
        if (p.downTimer <= 0) { p.state = 'flee'; p.fleeTimer = 1.5; }
        continue;
      }
      if (p.state === 'flee') {
        p.fleeTimer -= dt;
        p.mesh.position.x += p.fleeX * 5 * dt;
        p.mesh.position.z += p.fleeZ * 5 * dt;
        p.walkPhase += dt * 11;
        if (p.fleeTimer <= 0) p.state = 'walk';
      } else {
        // walk the block perimeter (offset 30 from block center)
        p.t += p.speed * dt;
        const per = 240; // 4 * 60
        const tt = ((p.t % per) + per) % per;
        let x = p.blockX, z = p.blockZ, heading = 0;
        if (tt < 60) { x = p.blockX - 30 + tt; z = p.blockZ - 30; heading = Math.PI / 2; }
        else if (tt < 120) { x = p.blockX + 30; z = p.blockZ - 30 + (tt - 60); heading = 0; }
        else if (tt < 180) { x = p.blockX + 30 - (tt - 120); z = p.blockZ + 30; heading = -Math.PI / 2; }
        else { x = p.blockX - 30; z = p.blockZ + 30 - (tt - 180); heading = Math.PI; }
        p.mesh.position.x = x; p.mesh.position.z = z;
        p.mesh.rotation.y = heading;
        p.walkPhase += dt * p.speed * 2.2;
      }
      // walk swing
      const sw = Math.sin(p.walkPhase) * 0.5;
      p.mesh.userData.legL.rotation.x = sw;
      p.mesh.userData.legR.rotation.x = -sw;
      p.mesh.userData.armL.rotation.x = -sw * 0.7;
      p.mesh.userData.armR.rotation.x = sw * 0.7;
    }
  }

  function knockDown(ped, fromX, fromZ) {
    if (ped.state === 'down') return;
    ped.state = 'down'; ped.downTimer = 3;
    ped.mesh.rotation.x = Math.PI / 2;
    ped.mesh.position.y = 0.4;
    const dx = ped.mesh.position.x - fromX, dz = ped.mesh.position.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    ped.fleeX = dx / d; ped.fleeZ = dz / d;
    setTimeout(() => { ped.mesh.rotation.x = 0; ped.mesh.position.y = 0; }, 3000);
  }

  function fleeFrom(x, z, radius) {
    for (const p of peds) {
      if (p.state !== 'walk') continue;
      const dx = p.mesh.position.x - x, dz = p.mesh.position.z - z;
      const d = Math.hypot(dx, dz);
      if (d < radius && d > 0.01) {
        p.state = 'flee'; p.fleeTimer = 1.2;
        p.fleeX = dx / d; p.fleeZ = dz / d;
        p.mesh.rotation.y = Math.atan2(p.fleeX, p.fleeZ);
      }
    }
  }

  // Add one traffic car at a chosen spot (used by shot staging): it joins the AI flow.
  function spawnAt(car, axis, at, dir, u) {
    cars.push({ car, axis, at, dir, u, speed: 9, target: 10, turnCooldown: 5 });
  }
  // Move `count` pedestrians onto the given block's south edge (near a player standing there).
  function placePedsNear(bx, bz, count) {
    let placed = 0;
    for (const p of peds) {
      if (placed >= count) break;
      if (p.state !== 'walk') continue;
      p.blockX = bx; p.blockZ = bz;
      p.t = 125 + placed * 14; // tt in [120,180): the z=+30 edge of the block
      placed++;
    }
  }

  return { init, update, knockDown, fleeFrom, spawnAt, placePedsNear, get cars() { return cars; }, get peds() { return peds; } };
})();
